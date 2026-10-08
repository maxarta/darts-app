import Foundation

/// Append-only USB-pullable log in the app Documents container.
/// Pull: `devicectl device copy from --domain-type appDataContainer --domain-identifier app.artdart.score --source Documents/darts-live.log`
enum LiveTelemetry {
    private static let queue = DispatchQueue(label: "app.artdart.score.telemetry")
    private static let fileName = "darts-live.log"
    private static var bridge: ((String) -> Void)?

    static func setBridge(_ send: @escaping (String) -> Void) {
        bridge = send
    }

    static var fileURL: URL {
        let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        return docs.appendingPathComponent(fileName)
    }

    static func clear() {
        queue.sync {
            try? Data().write(to: fileURL, options: .atomic)
        }
    }

    static func log(_ line: String) {
        let stamped = "\(isoNow()) \(line)"
        NSLog("%@", stamped)
        print(stamped)
        fflush(stdout)
        FileHandle.standardError.write(Data((stamped + "\n").utf8))

        queue.async {
            let url = fileURL
            if !FileManager.default.fileExists(atPath: url.path) {
                FileManager.default.createFile(atPath: url.path, contents: nil)
            }
            guard let handle = try? FileHandle(forWritingTo: url) else { return }
            defer { try? handle.close() }
            _ = try? handle.seekToEnd()
            if let data = (stamped + "\n").data(using: .utf8) {
                try? handle.write(contentsOf: data)
            }
        }

        DispatchQueue.main.async {
            bridge?(line)
        }
    }

    private static func isoNow() -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: Date())
    }
}
