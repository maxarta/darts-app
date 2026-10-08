import Foundation
import simd
import ARKit
import UIKit

struct DartScorerDiagnostics {
    var boardSamples: Int = 0
    var warmFrames: Int = 0
    var ready: Bool = false
    var bestDeltaMm: Float = 0
    var tipAlongMm: Float = 0
    var protruding: Int = 0
    var waitingClear: Bool = false
    var source: String = ""
    var arming: Bool = false
    var emptyCaptured: Bool = false
    var stableFrames: Int = 0
    var rgbPixels: Int = 0
    var rejectReason: String = ""
    var phase: String = "init"
    var dartsInVisit: Int = 0
}

enum DartScorerOutcome {
    case none
    case scored(NativeThrowInput)
    case boardCleared
}

/// RGB-only visit scorer (no LiDAR for throws).
/// empty → tip vs empty → settle → … → 3 darts → wait until RGB ≈ empty → next player.
final class DartScorer {
    private var lastHitAt: TimeInterval = 0
    private let cooldown: TimeInterval = 2.2
    private var armedAt: TimeInterval = 0
    private var stableFrames = 0
    private var emptyCaptured = false
    private var settleFrames = 0
    private var clearStableFrames = 0
    private var dartsInVisit = 0
    private var motionEma: Float = 0
    private var waitClearStartedAt: TimeInterval = 0
    private var sawOccupiedDuringWait = false
    private(set) var lastDiagnostics = DartScorerDiagnostics()
    private(set) var isWaitingForClear = false

    private let quietFramesNeeded = 10
    private let settleFramesNeeded = 12
    private let clearFramesNeeded = 40
    private let minWaitClearSeconds: TimeInterval = 2.5
    private let maxDartsPerVisit = 3
    /// Jump over idle noise to count as a throw.
    private let jumpOverEma: Float = 28
    private let strongJumpOverEma: Float = 45

    private enum Phase {
        case arming
        case listen
        case settle
        case waitClear
    }
    private var phase: Phase = .arming

    private let rgb = RgbMotionDetector()

    func reset() {
        lastHitAt = 0
        armedAt = 0
        stableFrames = 0
        emptyCaptured = false
        settleFrames = 0
        clearStableFrames = 0
        dartsInVisit = 0
        motionEma = 0
        waitClearStartedAt = 0
        sawOccupiedDuringWait = false
        isWaitingForClear = false
        phase = .arming
        rgb.reset()
        lastDiagnostics = DartScorerDiagnostics()
    }

    func beginWaitingForClear() {
        if phase == .waitClear, isWaitingForClear { return }
        isWaitingForClear = true
        clearStableFrames = 0
        sawOccupiedDuringWait = dartsInVisit > 0
        waitClearStartedAt = 0
        phase = .waitClear
        lastDiagnostics.waitingClear = true
    }

    func cancelWaitingForClear() {
        if dartsInVisit >= maxDartsPerVisit {
            beginWaitingForClear()
            return
        }
        isWaitingForClear = false
        clearStableFrames = 0
        sawOccupiedDuringWait = false
        waitClearStartedAt = 0
        phase = emptyCaptured ? .listen : .arming
        lastDiagnostics.waitingClear = false
    }

    func analyze(
        frame: ARFrame,
        plane: BoardPlane,
        imageCalib: BoardImageCalibration,
        orientation: UIInterfaceOrientation
    ) -> DartScorerOutcome {
        let now = frame.timestamp
        let maxFlash = Self.maxMotionPixels(for: imageCalib)
        _ = plane
        _ = orientation

        fillDiagnostics(now: now)

        if isWaitingForClear || phase == .waitClear {
            return handleWaitClear(now: now, frame: frame, imageCalib: imageCalib, maxFlash: maxFlash)
        }

        if phase == .arming || !emptyCaptured {
            return handleArming(now: now, frame: frame, imageCalib: imageCalib, maxFlash: maxFlash)
        }

        if phase == .settle {
            return handleSettle(frame: frame, imageCalib: imageCalib, maxFlash: maxFlash)
        }

        // Listen — RGB only.
        phase = .listen
        lastDiagnostics.phase = "listen"
        lastDiagnostics.ready = true

        let motion = rgb.peekMotionCount(frame: frame, calib: imageCalib)
        lastDiagnostics.rgbPixels = motion

        // Stale empty (exposure / PiP) → resnapshot when board should be empty.
        if dartsInVisit == 0, motion > maxFlash {
            rgb.captureEmpty(frame: frame, calib: imageCalib)
            motionEma = 0
            lastDiagnostics.rejectReason = "empty_refreshed"
            lastDiagnostics.phase = "refresh_empty"
            return .none
        }

        // Track idle noise while quiet.
        if Float(motion) < motionEma + 12 || motionEma == 0 {
            motionEma = motionEma == 0 ? Float(motion) : motionEma * 0.9 + Float(motion) * 0.1
        }

        if now - lastHitAt < cooldown {
            lastDiagnostics.rejectReason = "cooldown"
            return .none
        }

        let jump = Float(motion) - motionEma
        guard jump >= jumpOverEma, motion <= maxFlash else {
            lastDiagnostics.rejectReason = motion > maxFlash ? "rgb_flash" : "waiting_onset"
            return .none
        }
        // Weak jumps need to be clearly above noise.
        if jump < strongJumpOverEma, motion < Int(motionEma) + Int(jumpOverEma) {
            lastDiagnostics.rejectReason = "rgb_weak_jump"
            return .none
        }

        let minPx = rgb.adaptiveMinPixels
        guard let tip = rgb.analyze(
            frame: frame, calib: imageCalib, now: now, minPixelsOverride: minPx
        ) else {
            lastDiagnostics.rejectReason = "rgb_jump_no_tip"
            return .none
        }
        lastDiagnostics.rgbPixels = tip.pixelCount

        guard tip.pixelCount <= maxFlash,
              imageCalib.contains(imageX: tip.imageX, imageY: tip.imageY, slack: 1.12)
        else {
            lastDiagnostics.rejectReason = "outside_board"
            return .none
        }

        var scored = imageCalib.score(imageX: tip.imageX, imageY: tip.imageY)
        switch scored.segment {
        case .miss:
            lastDiagnostics.rejectReason = "scored_miss"
            return .none
        case .bull50 where tip.pixelCount > max(50, minPx * 5):
            lastDiagnostics.rejectReason = "bull_noise"
            return .none
        default:
            break
        }

        scored.confidence = min(0.9, scored.confidence)
        return commitScore(scored, now: now, source: "rgb")
    }

    // MARK: - Phases

    private func handleArming(
        now: TimeInterval,
        frame: ARFrame,
        imageCalib: BoardImageCalibration,
        maxFlash: Int
    ) -> DartScorerOutcome {
        phase = .arming
        lastDiagnostics.phase = "arming"
        lastDiagnostics.arming = true
        lastDiagnostics.ready = false

        let motion = rgb.hasEmptyReference
            ? rgb.peekMotionCount(frame: frame, calib: imageCalib)
            : 0
        lastDiagnostics.rgbPixels = motion

        // First capture after short stillness, or when we have no empty yet.
        if !emptyCaptured {
            stableFrames += 1
            lastDiagnostics.stableFrames = stableFrames
            if stableFrames >= quietFramesNeeded {
                rgb.captureEmpty(frame: frame, calib: imageCalib)
                emptyCaptured = rgb.hasEmptyReference
                motionEma = 0
                if emptyCaptured {
                    armedAt = now + 0.6
                }
            }
            lastDiagnostics.emptyCaptured = emptyCaptured
            lastDiagnostics.rejectReason = "need_quiet_empty"
            return .none
        }

        // Re-capture if still flashing hard.
        let m = rgb.peekMotionCount(frame: frame, calib: imageCalib)
        lastDiagnostics.rgbPixels = m
        if m > maxFlash {
            rgb.captureEmpty(frame: frame, calib: imageCalib)
            motionEma = 0
            armedAt = now + 0.5
            lastDiagnostics.rejectReason = "empty_refreshed"
            return .none
        }

        motionEma = motionEma == 0 ? Float(m) : motionEma * 0.85 + Float(m) * 0.15

        if armedAt > 0, now >= armedAt {
            phase = .listen
            lastDiagnostics.ready = true
            lastDiagnostics.arming = false
            lastDiagnostics.phase = "listen"
            lastDiagnostics.rejectReason = "-"
            return .none
        }

        lastDiagnostics.rejectReason = "arm_delay"
        return .none
    }

    private func handleSettle(
        frame: ARFrame,
        imageCalib: BoardImageCalibration,
        maxFlash: Int
    ) -> DartScorerOutcome {
        lastDiagnostics.phase = "settle"
        lastDiagnostics.ready = false
        let motion = rgb.peekMotionCount(frame: frame, calib: imageCalib)
        lastDiagnostics.rgbPixels = motion

        // Settled when motion back near idle (dart stuck, board quiet again).
        if motion <= Int(motionEma + 18), motion < maxFlash / 2 {
            settleFrames += 1
        } else {
            settleFrames = 0
        }
        lastDiagnostics.stableFrames = settleFrames

        if settleFrames >= settleFramesNeeded {
            settleFrames = 0
            // Fold current (with dart) into idle ema so next throw must jump again.
            motionEma = motionEma * 0.5 + Float(motion) * 0.5
            phase = .listen
            lastDiagnostics.phase = "listen"
            lastDiagnostics.ready = true
            lastDiagnostics.rejectReason = "settled"
            return .none
        }
        lastDiagnostics.rejectReason = "settle"
        return .none
    }

    private func handleWaitClear(
        now: TimeInterval,
        frame: ARFrame,
        imageCalib: BoardImageCalibration,
        maxFlash: Int
    ) -> DartScorerOutcome {
        phase = .waitClear
        isWaitingForClear = true
        lastDiagnostics.phase = "wait_clear"
        lastDiagnostics.waitingClear = true
        lastDiagnostics.ready = false

        if waitClearStartedAt == 0 { waitClearStartedAt = now }

        let motion = rgb.peekMotionCount(frame: frame, calib: imageCalib)
        lastDiagnostics.rgbPixels = motion

        // Occupied = lots of change vs visit-start empty (darts still in).
        if motion > Int(motionEma + 40) || motion > maxFlash / 4 {
            sawOccupiedDuringWait = true
        }

        // Empty ≈ low motion vs the original empty snapshot.
        // After darts removed, board matches empty reference again.
        let emptyNow = motion <= max(20, Int(motionEma * 0.35 + 15)) && motion < maxFlash / 5

        if emptyNow, sawOccupiedDuringWait {
            clearStableFrames += 1
        } else {
            clearStableFrames = 0
        }
        lastDiagnostics.stableFrames = clearStableFrames
        lastDiagnostics.rejectReason =
            !sawOccupiedDuringWait ? "wait_see_darts"
            : (!emptyNow ? "waiting_removal" : "empty_stabilizing")

        let waited = now - waitClearStartedAt >= minWaitClearSeconds
        guard waited, clearStableFrames >= clearFramesNeeded else { return .none }

        // Board empty — hand off.
        isWaitingForClear = false
        clearStableFrames = 0
        sawOccupiedDuringWait = false
        waitClearStartedAt = 0
        dartsInVisit = 0
        lastHitAt = now
        armedAt = 0
        stableFrames = 0
        emptyCaptured = false
        settleFrames = 0
        motionEma = 0
        rgb.reset()
        phase = .arming
        lastDiagnostics.waitingClear = false
        lastDiagnostics.dartsInVisit = 0
        lastDiagnostics.phase = "cleared"
        return .boardCleared
    }

    private func commitScore(
        _ scored: NativeThrowInput,
        now: TimeInterval,
        source: String
    ) -> DartScorerOutcome {
        lastHitAt = now
        lastDiagnostics.source = source
        lastDiagnostics.rejectReason = ""
        lastDiagnostics.phase = "scored"

        dartsInVisit += 1
        lastDiagnostics.dartsInVisit = dartsInVisit
        settleFrames = 0

        if dartsInVisit >= maxDartsPerVisit {
            beginWaitingForClear()
            lastDiagnostics.phase = "scored_wait"
        } else {
            phase = .settle
        }
        return .scored(scored)
    }

    private func fillDiagnostics(now: TimeInterval) {
        lastDiagnostics.boardSamples = 0
        lastDiagnostics.warmFrames = 0
        lastDiagnostics.ready = phase == .listen
        lastDiagnostics.bestDeltaMm = 0
        lastDiagnostics.tipAlongMm = 0
        lastDiagnostics.protruding = 0
        lastDiagnostics.waitingClear = isWaitingForClear || phase == .waitClear
        lastDiagnostics.source = ""
        lastDiagnostics.arming = phase == .arming
        lastDiagnostics.emptyCaptured = emptyCaptured
        lastDiagnostics.stableFrames = stableFrames
        lastDiagnostics.rgbPixels = rgb.lastMotionPixels
        lastDiagnostics.rejectReason = ""
        lastDiagnostics.phase = "\(phase)"
        lastDiagnostics.dartsInVisit = dartsInVisit
        _ = now
    }

    private static func maxMotionPixels(for calib: BoardImageCalibration) -> Int {
        // Match RgbMotionDetector adaptive scale (~70 px board radius target).
        let wantR: Float = 70
        let scale = min(1, max(wantR / max(calib.radiusPx, 1), 180 / max(calib.imageWidth, calib.imageHeight)))
        let r = calib.radiusPx * scale
        let area = Float.pi * r * r
        return max(500, min(8000, Int(area * 0.25)))
    }
}
