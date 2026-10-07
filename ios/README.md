# Darts Score — iOS shell (настоящий LiDAR)

Нативный контейнер вокруг https://artdart.vercel.app с **ARKit `sceneDepth`**.

В Safari/Telegram LiDAR недоступен. Этот таргет нужен для iPhone **Pro** (12 Pro и новее).

## Что делает

1. `WKWebView` грузит прод (или локальный URL).
2. Кнопка камеры в игре вызывает `DartsNative.startAutoScore()`.
3. Открывается ARKit-экран: вертикальная плоскость + mesh, тап в булл.
4. После «Готово» LiDAR следит за глубиной у мишени и шлёт `autoThrow` → веб-скоринг.
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
| `DartsScore/LiDAR/DartScorer.swift` | depth → throw |
| `DartsScore/LiDAR/BoardPlaneEstimator.swift` | plane + score math |

Веб-сторона: `lib/autoscore/native-bridge.ts` + `GameScreen`.

## Ограничения

- Скоринг по depth-диспаритету — MVP; для прод-точности позже подключить RGB tip-модель (Core ML) поверх той же плоскости.
- Нужен стабильный свет и штатив ~1–2 м.
- Сборка/подпись только с Mac — в этом cloud-агенте Xcode нет.
