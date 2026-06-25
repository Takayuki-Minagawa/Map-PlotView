# Map PlotView

Map PlotViewは、地図上に点・線・面の情報をプロットし、タグや写真、メモと一緒に管理できる静的Webアプリです。
データはYAMLとして読み込み・保存でき、範囲選択した結果をYAML / GeoJSON / CSVで書き出せます。

公開ページ: https://takayuki-minagawa.github.io/Map-PlotView/

## コンセプト

- サーバを用意せず、ブラウザだけで地図プロットを作成・確認する
- タグ、記号、色で地図上の情報を見分けやすくする
- YAMLでデータを持ち運び、必要に応じてGeoJSONやCSVへ変換する
- 現地確認、施設管理、調査地点、候補地、災害・地形情報などを地図上で整理する

## 主な機能

- **地図表示**: 国土地理院タイル、淡色地図、写真、OpenStreetMapを切替
- **オーバーレイ**: 活断層図を重ねて表示
- **プロット作成**: 点、線、面を地図上に作図
- **タグ管理**: タグごとに名称、色、記号を設定し、表示/非表示を切替
- **詳細表示**: 座標、表示項目、メモ、写真をサイドビューで確認
- **写真対応**: 写真のサムネイル表示、ライトボックス表示、EXIF情報の取り込み
- **範囲抽出**: 矩形選択でプロットを抽出し、交差/内包で判定
- **エクスポート**: 全体はYAML、抽出結果はYAML / GeoJSON / CSVで保存
- **多言語表示**: アプリUIは日本語を既定とし、英語へ切替可能
- **簡易マニュアル**: 日本語、中文、英語で表示
- **テーマ切替**: ライトモード、ダークモードに対応
- **レスポンシブ対応**: PC、タブレット、スマートフォンで利用可能

## 使い方

1. 公開ページをブラウザで開きます。
2. `読込(YAML)`から保存済みデータを読み込みます。初めて使う場合は`サンプル`を選択できます。
3. `点`、`線`、`面`を選び、地図上にプロットを作成します。
4. 編集画面で名称、タグ、表示項目、メモ、写真を設定します。
5. 一覧または地図上のプロットを選ぶと、詳細ビューで内容を確認できます。
6. `矩形選択`で範囲を指定すると、対象プロットを抽出できます。
7. `保存(YAML)`で全体を保存し、抽出結果はYAML / GeoJSON / CSVで書き出せます。

## データの扱い

Map PlotViewは静的Webアプリです。読み込んだYAMLや編集内容は、アプリのサーバへ送信されません。
地図タイル、ライブラリ、公開ページの配信には外部サービスを利用します。

- 地図タイル: 国土地理院、OpenStreetMap
- JavaScript/CSSライブラリ: CDN配信のLeaflet、Leaflet-Geoman、js-yaml、Turf.js、exifr
- 自動保存: ブラウザの`localStorage`を使用

重要なデータを扱う場合は、保存したYAMLファイルを手元で管理してください。

## YAMLデータ例

```yaml
version: 2
view:
  center: [35.681, 139.767]
  zoom: 13
  baseLayer: pale
  overlays: [afm]
tags:
  - id: site
    name: 建設サイト
    color: "#2e7d32"
    symbol: building
features:
  - id: f001
    type: point
    tag: site
    name: A棟予定地
    coordinates: [35.690, 139.700]
    properties:
      用途: 商業施設
    note: 地権者と交渉中。
    photos:
      - src: a_site_01.jpg
        caption: 北側からの全景
```

座標は緯度経度（WGS84 / EPSG:4326）で保持します。

## ファイル構成

```text
index.html            アプリ本体のエントリ
favicon.svg           ファビコン
css/style.css         レイアウト、テーマ、レスポンシブ表示
js/
  app.js              アプリ状態、イベント結線、入出力
  detail.js           詳細ビュー、写真表示、EXIF抽出
  i18n.js             多言語表示、簡易マニュアル、テーマ切替
  mapview.js          Leaflet地図、背景、オーバーレイ、作図表示
  select.js           矩形範囲抽出、距離・面積計測
  store.js            YAML読込/保存、検証、GeoJSON変換
  symbols.js          記号定義、地図マーカー
  ui.js               タグ、一覧、編集モーダル、エクスポート
samples/sample.yaml   サンプルデータ
.github/workflows/
  pages.yml           GitHub Pages公開ワークフロー
```

## GitHub Pages公開

`main`ブランチへpushされると、GitHub ActionsがJavaScript構文チェックを実行し、成功後にGitHub Pagesへ公開します。
手動で再公開したい場合は、GitHub Actionsの`Deploy GitHub Pages`ワークフローを`workflow_dispatch`で実行できます。

## ライセンスと出典

地図タイルを利用する際は、画面上に表示される各提供元の出典表示に従ってください。
OpenStreetMap、国土地理院タイル、その他外部ライブラリの利用条件は、それぞれの提供元ライセンスに従います。
