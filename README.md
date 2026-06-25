# Map PlotView — 地図プロットツール

地図上にタグ付きの点・線・面をプロットし、YAMLで保存/読込する**サーバ不要の静的Webツール**。
建設サイト・店舗・地震・活断層などを記号付きでプロットし、矩形で範囲抽出 → 詳細ビューア（写真付き）で確認できる。

> 本ツールは仕様書 兼 技術調査報告を `/goal` として実装したもの。要件 R1–R11 と設計概要は本 README に集約している。

## 使い方

`index.html` をブラウザで開くだけ（ビルド不要）。地図タイルとライブラリはCDN/オンライン取得のため、ネット接続が必要。

```
open index.html          # macOS（file:// で開ける）
# サンプル読込で fetch が必要な場合のみ簡易サーバ:
python3 -m http.server   # → http://localhost:8000/
```

- **読込(YAML)** … 保存済みデータを読み込む（`<input type=file>`）。
- **サンプル** … `samples/sample.yaml` を読み込む（`file://` では fetch 制限により失敗することがある。その場合は読込ボタンから選択）。
- **矩形選択** … 地図をドラッグして範囲内のフィーチャを抽出 → 左の「抽出結果」に一覧。判定は交差/内包を切替可。
- 一覧やプロットをクリック → 右の**詳細ビューア**（座標・表示項目・メモ・写真）を表示。
- **保存(YAML)** … 全体を保存。抽出結果は YAML / GeoJSON / CSV で書き出し可。
- **English / 日本語** … アプリ表示を日本語（既定）と英語で切替。
- **ダーク / ライト** … 端末利用向けにライトモードとダークモードを切替。
- **マニュアル** … 簡易マニュアルを日本語・中文・英語で表示。

## 機能と要件（R1–R11）

| 要件 | 内容 | 実装 |
|------|------|------|
| R1 | タグ・タグ項目の登録/表示 | `ui.js` タグ管理・凡例・ON/OFF |
| R2 | 記号付きポイント | `symbols.js` + `mapview.renderFeature` |
| R3 | 線・面 | `mapview.renderFeature`（polyline/polygon） |
| R4 | 静的動作（サーバ不要） | classic script + グローバル名前空間 |
| R5 | アップロード読込 | `FileReader` → `Store.parseYaml` |
| R6 | YAML（メモ記述可） | `store.js`（js-yaml） |
| R7/R8 | 拡大移動・高精度地図 | Leaflet + 地理院タイル |
| R9 | 矩形範囲抽出 | `mapview.startRectangleSelect` + `select.js`（turf） |
| R10 | 詳細ビューア | `detail.js` |
| R11 | 写真情報・表示 | `detail.js`（ギャラリ/ライトボックス/exifr） |

## 構成

```
index.html            エントリ（CDN: leaflet, geoman, js-yaml, turf, exifr）
css/style.css
js/
  symbols.js   記号(divIcon)定義
  store.js     YAML⇄内部構造 / 検証 / GeoJSON変換
  mapview.js   Leaflet初期化 / レイヤ / 描画 / 矩形選択 / ハイライト
  select.js    範囲抽出（turf 空間判定）
  detail.js    詳細ビューア / 写真 / ライトボックス / EXIF
  i18n.js      多言語表示 / 簡易マニュアル / テーマ切替
  ui.js        サイドバー / タグ / 一覧 / 編集モーダル / エクスポート
  app.js       状態管理・イベント結線（中心）
samples/sample.yaml
favicon.svg
```

座標は緯度経度（WGS84/EPSG:4326）で保持。地理院タイル/OSM 利用時は**出典明示**が必要。

## データ形式（YAML 抜粋）

```yaml
version: 2
view: { center: [35.681, 139.767], zoom: 13, baseLayer: pale, overlays: [afm] }
tags:
  - { id: site, name: 建設サイト, color: "#2e7d32", symbol: building }
features:
  - id: f001
    type: point            # point | line | polygon
    tag: site
    name: A棟予定地
    coordinates: [35.690, 139.700]   # [緯度, 経度]
    properties: { 用途: 商業施設 }
    note: 地権者と交渉中。
    photos:
      - { src: a_site_01.jpg, caption: 北側からの全景 }
```

## テスト

純ロジック（parse/validate/GeoJSON変換/範囲抽出）は Node ハーネスで検証（22 ケース）。
DOM/地図描画は静的レビューで配線・API利用を確認。
