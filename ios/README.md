# Darts Score — iOS shell (настоящий LiDAR)

Нативный контейнер вокруг https://artdart.vercel.app с **ARKit `sceneDepth`**.

В Safari LiDAR недоступен. Этот таргет нужен для iPhone **Pro** (12 Pro и новее).

## Что делает

1. `WKWebView` грузит прод (или локальный URL).
2. Кнопка камеры в игре вызывает `DartsNative.startAutoScore()`.
3. Открывается ARKit-экран: вертикальная плоскость + mesh, тап в булл.
4. После «Готово» работает схема как у DartsMind: **счёт в 2D по RGB** (tip в кадре →
   круг мишени). LiDAR только задаёт масштаб (170 мм → radius в пикселях), проверяет
   глубину у типа и детектит «достали дротики». Шлёт `autoThrow` → веб-скоринг.
5. На не-Pro девайсе web получает `autoScoreFallback` и включает обычную камеру.

## Требования

- Mac + Xcode 15+
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`)
- Физический iPhone Pro (симулятор без LiDAR)
- Apple Developer team id в настройках signing

## Сборка

```bash
cd ios
./generate-project.sh   # или: xcodegen generate
open DartsScore.xcodeproj
```

В Xcode:

1. Signing & Capabilities → выбери свою Team.
2. Bundle ID при необходимости поменяй (`app.artdart.score`).
3. Run на iPhone Pro.

### Локальный веб вместо прода

В схеме / Arguments или через defaults:

```bash
defaults write app.artdart.score DartsStartURL -string "http://<mac-ip>:5173"
```

Для HTTP на девайсе нужен ATS exception (уже есть для `localhost`) — для LAN IP добавь свой хост в `Info.plist` → `NSExceptionDomains`.

## Файлы

| Путь | Роль |
|------|------|
| `DartsScore/Web/WebContainerView.swift` | WKWebView |
| `DartsScore/Bridge/NativeBridge.swift` | JS ↔ Swift |
| `DartsScore/LiDAR/LidarSession.swift` | ARKit session |
| `DartsScore/LiDAR/LidarCalibrateView.swift` | UI калибровки |
| `DartsScore/LiDAR/DartScorer.swift` | RGB+LiDAR fusion → throw |
| `DartsScore/LiDAR/RgbMotionDetector.swift` | frame-diff tip on capturedImage |
| `DartsScore/LiDAR/BoardPlaneEstimator.swift` | plane + score math |

Веб-сторона: `lib/autoscore/native-bridge.ts` + `GameScreen`.

## Ограничения

- RGB tip — motion/frame-diff (как веб-MVP), не нейросеть; в темноте RGB слабее, LiDAR держит fallback.
- Штатив ~1.5–2.5 м напротив мишени заметно точнее.
- Сборка/подпись только с Mac.
