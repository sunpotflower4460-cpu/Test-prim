# LUMINA — 星灯りの庭

**光が眠る、３つの世界。最後の星を、あなたの手で。**

幻想アクションゲーム。スマートフォンのブラウザでそのまま遊べます。インストール、ログイン、課金不要。

## 🎮 遊ぶ

- **GitHub Pages**: https://sunpotflower4460-cpu.github.io/Test-prim/
- **Pages 未設定でも遊べるプレビュー**: https://raw.githack.com/sunpotflower4460-cpu/Test-prim/main/index.html

GitHub Pages 未設定の場合は、リポジトリの Settings → Pages → Build and deployment → Deploy from a branch → main / (root) → Save を一度だけ選択します。その後は更新が自動公開されます。

## ゲーム内容

「黎明の森」「月影の湖」「星の神殿」を旅し、星の力を集めながら敵を浄化。３体の章ボスを倒して夜明けを迎えよう。

- **スマホ**：左のスティックで移動、右の DASH で回避。攻撃は自動。
- **PC**：WASD・矢印で移動、Space・Shift でダッシュ、P・Esc で一時停止。
- レベルアップ時は３つの祝福から１つを選びます。12種類のスキルと強化段階。
- 個性の違う敵、３章とボス戦、オリジナルの光の描画と生成音楽。
- スマホ縦画面向けUI。ローカル記録。PWA と対応環境でのオフラインキャッシュ。

## 技術

HTML / CSS / Vanilla JavaScript / Canvas 2D / Web Audio / Service Worker。ビルド・外部ゲームエンジン不要。

## ローカル起動

```bash
python3 -m http.server 8000
```

http://localhost:8000 にアクセスしてください。

© 2026 LUMINA · Original game