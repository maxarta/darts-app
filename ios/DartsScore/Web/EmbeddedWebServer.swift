import Foundation
import Network

/// Bundled web UI on loopback + LAN MJPEG vision stream for the club TV.
final class EmbeddedWebServer {
    static let shared = EmbeddedWebServer()

    private var listener: NWListener?
    private(set) var port: NWEndpoint.Port?
    private let queue = DispatchQueue(label: "app.artdart.score.webserver")
    private var root: URL?

    /// Latest vision JPEG (unwrap / board crop). Updated from LiDAR session.
    private var latestVisionJPEG: Data?
    private var visionGeneration: UInt64 = 0
    private var streamClients: [ObjectIdentifier: NWConnection] = [:]

    /// Loopback URL for the in-app WKWebView.
    @discardableResult
    func startIfNeeded() -> URL? {
        if let port {
            return URL(string: "http://127.0.0.1:\(port.rawValue)/")
        }
        guard let root = Bundle.main.url(forResource: "EmbeddedWeb", withExtension: nil)
            ?? Bundle.main.resourceURL?.appendingPathComponent("EmbeddedWeb", isDirectory: true),
            FileManager.default.fileExists(atPath: root.path)
        else {
            LiveTelemetry.log("DARTS_LIVE event=embed_web_missing")
            return nil
        }
        self.root = root

        do {
            // Fixed port so the LAN /vision.html URL survives app restarts.
            let params = NWParameters.tcp
            params.allowLocalEndpointReuse = true
            let listener = try NWListener(using: params, on: 8765)
            self.listener = listener
            listener.stateUpdateHandler = { [weak self] state in
                guard let self else { return }
                if case .ready = state, let p = listener.port {
                    self.port = p
                    LiveTelemetry.log(
                        "DARTS_LIVE event=embed_web_ready port=\(p.rawValue)"
                    )
                }
                if case .failed(let err) = state {
                    LiveTelemetry.log(
                        "DARTS_LIVE event=embed_web_fail \(err.localizedDescription)"
                    )
                }
            }
            listener.newConnectionHandler = { [weak self] conn in
                self?.handle(conn)
            }
            listener.start(queue: queue)
            for _ in 0..<50 {
                if port != nil { break }
                Thread.sleep(forTimeInterval: 0.02)
            }
            if let port {
                return URL(string: "http://127.0.0.1:\(port.rawValue)/")
            }
        } catch {
            LiveTelemetry.log(
                "DARTS_LIVE event=embed_web_start_err \(error.localizedDescription)"
            )
        }
        return nil
    }

    /// LAN base for TV (same Wi‑Fi), e.g. `http://192.168.1.12:60123`.
    func lanBaseURL() -> URL? {
        guard let port else { return nil }
        guard let ip = Self.primaryLANAddress() else { return nil }
        return URL(string: "http://\(ip):\(port.rawValue)")
    }

    /// Live MJPEG URL for the TV board.
    func visionStreamURL() -> URL? {
        lanBaseURL()?.appendingPathComponent("vision.mjpg")
    }

    /// Push a new camera/unwrap frame into the live stream.
    func updateVisionJPEG(_ jpeg: Data) {
        queue.async {
            self.latestVisionJPEG = jpeg
            self.visionGeneration &+= 1
            let gen = self.visionGeneration
            let clients = self.streamClients
            for (_, conn) in clients {
                self.writeMJPEGFrame(jpeg, to: conn, generation: gen)
            }
        }
    }

    // MARK: - HTTP

    private func handle(_ connection: NWConnection) {
        connection.start(queue: queue)
        receive(on: connection, buffer: Data())
    }

    private func receive(on connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) {
            [weak self] data, _, isComplete, error in
            guard let self else { return }
            if error != nil {
                self.dropStream(connection)
                connection.cancel()
                return
            }
            var buf = buffer
            if let data { buf.append(data) }
            if let range = buf.range(of: Data("\r\n\r\n".utf8)) {
                let head = buf.subdata(in: buf.startIndex..<range.lowerBound)
                self.respond(to: connection, requestHead: head)
                return
            }
            if isComplete {
                self.dropStream(connection)
                connection.cancel()
                return
            }
            self.receive(on: connection, buffer: buf)
        }
    }

    private func respond(to connection: NWConnection, requestHead: Data) {
        guard let text = String(data: requestHead, encoding: .utf8),
              let requestLine = text.split(separator: "\r\n").first
        else {
            connection.cancel()
            return
        }
        let parts = requestLine.split(separator: " ")
        guard parts.count >= 2 else {
            connection.cancel()
            return
        }
        var path = String(parts[1])
        if let q = path.firstIndex(of: "?") {
            path = String(path[..<q])
        }
        if path == "/" { path = "/index.html" }

        if path == "/vision.mjpg" || path == "/vision" {
            startMJPEG(on: connection)
            return
        }
        if path == "/vision.jpg" {
            let body = latestVisionJPEG ?? Data()
            send(
                connection,
                status: body.isEmpty ? 503 : 200,
                contentType: "image/jpeg",
                body: body.isEmpty ? Data("no frame".utf8) : body,
                close: true
            )
            return
        }
        if path == "/vision.html" {
            let html = """
            <!doctype html><meta name=viewport content="width=device-width,initial-scale=1">
            <title>ArtDart Vision</title>
            <style>html,body{margin:0;background:#111;height:100%;display:flex;align-items:center;justify-content:center}
            img{max-width:96vw;max-height:96vh;border-radius:12px}</style>
            <img src="/vision.mjpg" alt="vision">
            """
            send(
                connection,
                status: 200,
                contentType: "text/html; charset=utf-8",
                body: Data(html.utf8),
                close: true
            )
            return
        }

        if path.hasPrefix("/api/") {
            proxyAPI(path: path, connection: connection)
            return
        }

        guard let root else {
            send(connection, status: 500, contentType: "text/plain", body: Data("no root".utf8), close: true)
            return
        }
        let rel = path.hasPrefix("/") ? String(path.dropFirst()) : path
        let fileURL = root.appendingPathComponent(rel).standardizedFileURL
        guard fileURL.path.hasPrefix(root.standardizedFileURL.path),
              let body = try? Data(contentsOf: fileURL)
        else {
            send(connection, status: 404, contentType: "text/plain", body: Data("not found".utf8), close: true)
            return
        }
        send(
            connection,
            status: 200,
            contentType: mimeType(for: fileURL.pathExtension),
            body: body,
            close: true
        )
    }

    private func startMJPEG(on connection: NWConnection) {
        let id = ObjectIdentifier(connection)
        streamClients[id] = connection
        LiveTelemetry.log("DARTS_LIVE event=vision_stream_open clients=\(streamClients.count)")

        var head = "HTTP/1.1 200 OK\r\n"
        head += "Content-Type: multipart/x-mixed-replace; boundary=framedata\r\n"
        head += "Cache-Control: no-cache, no-store, must-revalidate\r\n"
        head += "Pragma: no-cache\r\n"
        head += "Access-Control-Allow-Origin: *\r\n"
        head += "Connection: keep-alive\r\n"
        head += "\r\n"
        connection.send(content: Data(head.utf8), completion: .contentProcessed { [weak self] error in
            guard let self else { return }
            if error != nil {
                self.dropStream(connection)
                connection.cancel()
                return
            }
            if let jpeg = self.latestVisionJPEG {
                self.writeMJPEGFrame(jpeg, to: connection, generation: self.visionGeneration)
            }
            // Keep reading so we notice client disconnect.
            self.watchStream(connection)
        })
    }

    private func watchStream(_ connection: NWConnection) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 1024) {
            [weak self] _, _, isComplete, error in
            guard let self else { return }
            if isComplete || error != nil {
                self.dropStream(connection)
                connection.cancel()
                return
            }
            self.watchStream(connection)
        }
    }

    private func writeMJPEGFrame(_ jpeg: Data, to connection: NWConnection, generation: UInt64) {
        var part = "--framedata\r\n"
        part += "Content-Type: image/jpeg\r\n"
        part += "Content-Length: \(jpeg.count)\r\n"
        part += "X-Vision-Gen: \(generation)\r\n"
        part += "\r\n"
        var payload = Data(part.utf8)
        payload.append(jpeg)
        payload.append(Data("\r\n".utf8))
        connection.send(content: payload, completion: .contentProcessed { [weak self] error in
            if error != nil {
                self?.dropStream(connection)
                connection.cancel()
            }
        })
    }

    private func dropStream(_ connection: NWConnection) {
        let id = ObjectIdentifier(connection)
        if streamClients.removeValue(forKey: id) != nil {
            LiveTelemetry.log("DARTS_LIVE event=vision_stream_close clients=\(streamClients.count)")
        }
    }

    private func proxyAPI(path: String, connection: NWConnection) {
        let urlString = "https://artdart.vercel.app\(path)"
        guard let url = URL(string: urlString) else {
            send(connection, status: 502, contentType: "text/plain", body: Data("bad url".utf8), close: true)
            return
        }
        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        req.timeoutInterval = 20
        URLSession.shared.dataTask(with: req) { [weak self] data, response, _ in
            guard let self else { return }
            let http = response as? HTTPURLResponse
            self.send(
                connection,
                status: http?.statusCode ?? 502,
                contentType: http?.mimeType ?? "application/json",
                body: data ?? Data(),
                close: true
            )
        }.resume()
    }

    private func send(
        _ connection: NWConnection,
        status: Int,
        contentType: String,
        body: Data,
        close: Bool
    ) {
        let reason: String
        switch status {
        case 200: reason = "OK"
        case 404: reason = "Not Found"
        case 503: reason = "Service Unavailable"
        case 502: reason = "Bad Gateway"
        default: reason = "Error"
        }
        var head = "HTTP/1.1 \(status) \(reason)\r\n"
        head += "Content-Type: \(contentType)\r\n"
        head += "Content-Length: \(body.count)\r\n"
        head += close ? "Connection: close\r\n" : "Connection: keep-alive\r\n"
        head += "Cache-Control: no-cache\r\n"
        head += "Access-Control-Allow-Origin: *\r\n"
        head += "\r\n"
        var payload = Data(head.utf8)
        payload.append(body)
        connection.send(content: payload, completion: .contentProcessed { _ in
            if close { connection.cancel() }
        })
    }

    private func mimeType(for ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json", "webmanifest": return "application/json"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "webp": return "image/webp"
        case "ico": return "image/x-icon"
        case "woff2": return "font/woff2"
        case "wasm": return "application/wasm"
        case "onnx": return "application/octet-stream"
        default: return "application/octet-stream"
        }
    }

    private static func primaryLANAddress() -> String? {
        var address: String?
        var ifaddr: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&ifaddr) == 0, let first = ifaddr else { return nil }
        defer { freeifaddrs(ifaddr) }
        var ptr: UnsafeMutablePointer<ifaddrs>? = first
        while let p = ptr {
            defer { ptr = p.pointee.ifa_next }
            guard p.pointee.ifa_addr.pointee.sa_family == UInt8(AF_INET) else { continue }
            let name = String(cString: p.pointee.ifa_name)
            guard name.hasPrefix("en") else { continue }
            var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            getnameinfo(
                p.pointee.ifa_addr,
                socklen_t(p.pointee.ifa_addr.pointee.sa_len),
                &hostname,
                socklen_t(hostname.count),
                nil,
                0,
                NI_NUMERICHOST
            )
            let ip = String(cString: hostname)
            if ip.hasPrefix("127.") { continue }
            address = ip
            if name == "en0" { break }
        }
        return address
    }
}
