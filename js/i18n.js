/* i18n.js — app translations, manual modal, and theme controls */
(function (global) {
  'use strict';

  var LANG_KEY = 'mpv:language';
  var THEME_KEY = 'mpv:theme';
  var currentLang = 'ja';
  var currentTheme = 'light';
  var subscribers = [];

  var M = {
    ja: {
      title: 'Map PlotView - 地図プロットツール',
      manualOpen: 'マニュアル',
      loadData: '読込',
      saveYaml: '保存(YAML)',
      saveGeoJson: '保存(GeoJSON)',
      sample: 'サンプル',
      statusReady: '',
      layersTitle: '背景 / オーバーレイ',
      baseStd: '標準',
      basePale: '淡色',
      basePhoto: '写真',
      baseOsm: 'OSM',
      overlayAfm: '活断層図',
      tagsTitle: 'タグ',
      add: '追加',
      drawingTitle: '作図',
      addPoint: '点',
      addLine: '線',
      addPolygon: '面',
      selectTitle: '範囲抽出',
      rectSelect: '矩形選択',
      clear: 'クリア',
      judge: '判定:',
      intersect: '交差',
      within: '内包',
      respectHidden: '非表示タグを除外',
      selectionResult: '抽出結果',
      exportSelection: '抽出を書出:',
      featureList: 'プロット一覧',
      fitAll: '全体表示',
      searchPlaceholder: '検索（名称/ID/タグ）',
      mapOnlyOpen: '地図のみ',
      mapOnlyClose: 'パネルを表示',
      langToggle: 'English',
      themeToggleDark: 'ダーク',
      themeToggleLight: 'ライト',
      edit: '編集',
      delete: '削除',
      cancel: 'キャンセル',
      save: '保存',
      close: '閉じる',
      focusOnMap: '地図でフォーカス',
      uncategorized: '未分類',
      unnamed: '(無名)',
      noData: 'データがありません。',
      selectionEmpty: '矩形選択でデータを抽出します。',
      selectedCount: '（{count}件）',
      loadError: '読込エラー: {message}',
      deleteTagConfirm: 'タグ "{id}" を削除しますか？（所属フィーチャは未分類へ）',
      deleteFeatureConfirm: 'このプロットを削除しますか？',
      drawToolMissing: '作図ツール(Leaflet-Geoman)が読み込まれていません。',
      dragRect: '矩形をドラッグして範囲を指定…',
      selectedStatus: '{count} 件抽出（{mode}）',
      sampleLoadError: 'サンプル読込に失敗しました（file:// では fetch が制限される場合があります）。\nローカルサーバ経由で開くか、ファイル選択から sample.yaml を読み込んでください。\n{message}',
      restoreAutosave: '前回の編集データを復元しますか？',
      warningsTitle: '読込時の注意 ({count})',
      addTagTitle: 'タグを追加',
      editTagTitle: 'タグを編集',
      idRequired: 'IDは必須です',
      tagIdExists: 'ID "{id}" のタグは既に存在します',
      fieldId: 'ID',
      fieldName: '名称',
      fieldColor: '色',
      fieldSymbol: '記号',
      fieldDescription: '説明',
      addPlotTitle: 'プロットを追加',
      editPlotTitle: 'プロットを編集',
      fieldTag: 'タグ',
      fieldSymbolOverride: '記号(上書き任意)',
      fieldTypeCoords: '種別/座標',
      fieldProps: '表示項目 (key: value 改行区切り)',
      fieldNote: 'メモ',
      fieldPhotos: '写真',
      placeholderCaption: 'キャプション',
      embedDataUrl: 'Data URLで埋め込み (方式C)',
      symbolDefault: '(タグ既定)',
      coordinateUnset: '(未設定)',
      pointsCount: '{count}点',
      detailEmpty: '項目を選択すると詳細が表示されます。',
      coordinates: '座標',
      properties: '表示項目',
      note: 'メモ',
      photos: '写真',
      latitude: '緯度',
      longitude: '経度',
      vertexCount: '頂点数 {count}',
      approxLength: '概算長 {value} km',
      representativePoint: '代表点',
      ringVertexCount: 'リング数 {rings} / 頂点数 {verts}',
      approxArea: '概算面積 {value}',
      takenAt: '撮影',
      location: '位置',
      point: '点',
      line: '線',
      polygon: '面',
      manualTitle: '簡易マニュアル',
      manualIntro: '基本操作を言語別に確認できます。',
      errFeatureNotObject: 'feature がオブジェクトではありません',
      errMissingId: 'id がありません',
      errInvalidType: 'type は point|line|polygon のいずれかである必要があります: {type}',
      errInvalidPointCoords: 'point の coordinates は [緯度, 経度] の数値2要素である必要があります',
      errLineCoords: 'line の coordinates は2点以上の配列である必要があります',
      errLineVertex: 'line 頂点[{index}] が不正です（緯度-90..90/経度-180..180）',
      errPolygonCoords: 'polygon の coordinates はリング配列である必要があります',
      errPolygonRing: 'polygon リング[{ring}] は3点以上必要です',
      errPolygonVertex: 'polygon リング[{ring}] 頂点[{index}] が不正です',
      yamlSyntaxError: 'YAML構文エラー: {message}',
      yamlEmptyError: 'YAMLの内容が空、またはオブジェクトではありません',
      geojsonSyntaxError: 'GeoJSON構文エラー: {message}',
      geojsonEmptyError: 'GeoJSONにFeatureが含まれていません（FeatureCollectionまたはFeatureが必要）',
      warningGeoJSONGeometry: 'features[{index}]: 未対応のgeometry "{geomType}" のためスキップ（Point/LineString/Polygonのみ対応）',
      warningDuplicateId: 'features[{index}]: ID "{id}" が重複しているため "{newId}" に変更',
      warningFeatureInvalid: 'features[{index}] ({id}): {errors}',
      warningUnknownTag: 'features[{index}] ({id}): タグ "{tag}" が未定義のため「未分類」に変更',
      warningTagInvalid: 'tags[{index}]: id の無い不正なタグ定義のためスキップ',
      warningDuplicateTag: 'tags[{index}]: タグID "{id}" が重複しているためスキップ',
      warningMergeDuplicateId: 'ID "{id}" は既存データと重複するため "{newId}" に変更',
      csvEmptyError: 'CSVにデータ行がありません（1行目は見出し行として扱います）',
      csvNoLatLngError: 'CSVに緯度・経度の列が見つかりません（見出しに lat / lng、または 緯度 / 経度 が必要）',
      warningCsvNonPoint: '{row}行目: 種別 "{type}" は点ではないためスキップ（CSVで取り込めるのは点のみ）',
      warningCsvDuplicateId: '{row}行目: ID "{id}" が重複しているため "{newId}" に変更',
      warningCsvRow: '{row}行目: {errors}',
      placeSearchTitle: '場所検索',
      placeSearchPlaceholder: '住所・地名 / 緯度,経度',
      search: '検索',
      searching: '検索中…',
      searchNoResult: '該当する場所が見つかりません。',
      searchError: '検索に失敗しました: {message}',
      addPointHere: 'ここに点を追加',
      overlayHillshade: '陰影起伏図',
      overlayRelief: '色別標高図',
      overlayFlood: '洪水浸水想定',
      overlaySediment: '土砂災害警戒区域',
      overlayTsunami: '津波浸水想定',
      overlayOpacity: '重ね合わせの濃さ',
      undo: '元に戻す',
      redo: 'やり直し',
      undoTitle: '元に戻す (Ctrl+Z)',
      redoTitle: 'やり直し (Ctrl+Shift+Z / Ctrl+Y)',
      undone: '元に戻しました',
      redone: 'やり直しました',
      locate: '現在地を表示',
      locating: '現在地を取得中…',
      locateError: '現在地を取得できません: {message}',
      reshape: '形状編集',
      reshapeEditing: '形状を編集中',
      reshapeConfirm: '確定',
      reshapeHidden: '非表示のプロットは形状を編集できません。タグを表示してください。',
      reshapeHintPoint: '点をドラッグして移動し、「確定」(Enter) で保存。Escで取消。',
      reshapeHintShape: '頂点をドラッグして移動、中間点をドラッグして追加、右クリックで削除。「確定」(Enter) で保存。Escで取消。',
      reshapeInvalid: '形状が不正なため変更を取り消しました: {errors}',
      reshapeSaved: '形状を更新しました',
      dropHint: 'ここにファイルをドロップして読込（YAML / GeoJSON / CSV）',
      importTitle: 'データの読込',
      importMessage: '現在のデータ（{current}件）があります。\n読み込むデータ（{incoming}件）を追加しますか、それとも置き換えますか？',
      importMerge: '追加する',
      importReplace: '置き換える',
      elevationGet: '標高を取得',
      elevationLoading: '取得中…',
      elevationNoData: 'この地点の標高データはありません。',
      elevationValue: '標高 {value} m（{source}）',
      elevationSave: '表示項目に保存',
      elevationPropKey: '標高(m)',
      elevationError: '標高を取得できません: {message}',
      propertySaved: '「{key}」を表示項目に保存しました',
      autosaveFailed: '自動保存できませんでした（ブラウザの保存容量を超えています）。ファイルに保存してください。'
    },
    en: {
      title: 'Map PlotView - Map Plotting Tool',
      manualOpen: 'Manual',
      loadData: 'Load',
      saveYaml: 'Save YAML',
      saveGeoJson: 'Save GeoJSON',
      sample: 'Sample',
      statusReady: '',
      layersTitle: 'Base / Overlays',
      baseStd: 'Standard',
      basePale: 'Pale',
      basePhoto: 'Photo',
      baseOsm: 'OSM',
      overlayAfm: 'Active faults',
      tagsTitle: 'Tags',
      add: 'Add',
      drawingTitle: 'Draw',
      addPoint: 'Point',
      addLine: 'Line',
      addPolygon: 'Polygon',
      selectTitle: 'Area Extract',
      rectSelect: 'Rectangle',
      clear: 'Clear',
      judge: 'Mode:',
      intersect: 'Intersect',
      within: 'Within',
      respectHidden: 'Exclude hidden tags',
      selectionResult: 'Results',
      exportSelection: 'Export:',
      featureList: 'Plots',
      fitAll: 'Fit all',
      searchPlaceholder: 'Search (name / ID / tag)',
      mapOnlyOpen: 'Map only',
      mapOnlyClose: 'Show panels',
      langToggle: '日本語',
      themeToggleDark: 'Dark',
      themeToggleLight: 'Light',
      edit: 'Edit',
      delete: 'Delete',
      cancel: 'Cancel',
      save: 'Save',
      close: 'Close',
      focusOnMap: 'Focus on map',
      uncategorized: 'Uncategorized',
      unnamed: '(Unnamed)',
      noData: 'No data.',
      selectionEmpty: 'Use rectangle selection to extract data.',
      selectedCount: '({count})',
      loadError: 'Load error: {message}',
      deleteTagConfirm: 'Delete tag "{id}"? Features using it will move to Uncategorized.',
      deleteFeatureConfirm: 'Delete this plot?',
      drawToolMissing: 'The drawing tool (Leaflet-Geoman) is not loaded.',
      dragRect: 'Drag a rectangle to select an area...',
      selectedStatus: '{count} selected ({mode})',
      sampleLoadError: 'Failed to load the sample. Browser fetch may be restricted from file://.\nOpen through a local server, or load sample.yaml from the file picker.\n{message}',
      restoreAutosave: 'Restore the previous autosaved edit data?',
      warningsTitle: 'Load warnings ({count})',
      addTagTitle: 'Add tag',
      editTagTitle: 'Edit tag',
      idRequired: 'ID is required',
      tagIdExists: 'A tag with ID "{id}" already exists',
      fieldId: 'ID',
      fieldName: 'Name',
      fieldColor: 'Color',
      fieldSymbol: 'Symbol',
      fieldDescription: 'Description',
      addPlotTitle: 'Add plot',
      editPlotTitle: 'Edit plot',
      fieldTag: 'Tag',
      fieldSymbolOverride: 'Symbol override',
      fieldTypeCoords: 'Type / coordinates',
      fieldProps: 'Display fields (key: value, one per line)',
      fieldNote: 'Note',
      fieldPhotos: 'Photos',
      placeholderCaption: 'Caption',
      embedDataUrl: 'Embed as Data URL (method C)',
      symbolDefault: '(Tag default)',
      coordinateUnset: '(Unset)',
      pointsCount: '{count} points',
      detailEmpty: 'Select an item to view details.',
      coordinates: 'Coordinates',
      properties: 'Display Fields',
      note: 'Note',
      photos: 'Photos',
      latitude: 'Lat',
      longitude: 'Lng',
      vertexCount: '{count} vertices',
      approxLength: 'Approx. length {value} km',
      representativePoint: 'Representative point',
      ringVertexCount: '{rings} rings / {verts} vertices',
      approxArea: 'Approx. area {value}',
      takenAt: 'Taken',
      location: 'Location',
      point: 'Point',
      line: 'Line',
      polygon: 'Polygon',
      manualTitle: 'Quick Manual',
      manualIntro: 'Check the basic workflow in each language.',
      errFeatureNotObject: 'feature is not an object',
      errMissingId: 'id is missing',
      errInvalidType: 'type must be one of point|line|polygon: {type}',
      errInvalidPointCoords: 'point coordinates must be a numeric [latitude, longitude] pair',
      errLineCoords: 'line coordinates must contain at least two points',
      errLineVertex: 'line vertex[{index}] is invalid (latitude -90..90 / longitude -180..180)',
      errPolygonCoords: 'polygon coordinates must be an array of rings',
      errPolygonRing: 'polygon ring[{ring}] must contain at least three points',
      errPolygonVertex: 'polygon ring[{ring}] vertex[{index}] is invalid',
      yamlSyntaxError: 'YAML syntax error: {message}',
      yamlEmptyError: 'YAML content is empty or is not an object',
      geojsonSyntaxError: 'GeoJSON syntax error: {message}',
      geojsonEmptyError: 'The GeoJSON contains no features (FeatureCollection or Feature required)',
      warningGeoJSONGeometry: 'features[{index}]: unsupported geometry "{geomType}" skipped (only Point/LineString/Polygon are supported)',
      warningDuplicateId: 'features[{index}]: duplicate ID "{id}" renamed to "{newId}"',
      warningFeatureInvalid: 'features[{index}] ({id}): {errors}',
      warningUnknownTag: 'features[{index}] ({id}): tag "{tag}" is undefined, changed to Uncategorized',
      warningTagInvalid: 'tags[{index}]: invalid tag definition without an id, skipped',
      warningDuplicateTag: 'tags[{index}]: duplicate tag ID "{id}" skipped',
      warningMergeDuplicateId: 'ID "{id}" already exists, renamed to "{newId}"',
      csvEmptyError: 'The CSV has no data rows (the first row is treated as the header)',
      csvNoLatLngError: 'No latitude/longitude columns found in the CSV (headers lat / lng or latitude / longitude are required)',
      warningCsvNonPoint: 'row {row}: type "{type}" is not a point, skipped (only points can be imported from CSV)',
      warningCsvDuplicateId: 'row {row}: duplicate ID "{id}" renamed to "{newId}"',
      warningCsvRow: 'row {row}: {errors}',
      placeSearchTitle: 'Place Search',
      placeSearchPlaceholder: 'Address / place name or lat,lng',
      search: 'Search',
      searching: 'Searching...',
      searchNoResult: 'No matching place found.',
      searchError: 'Search failed: {message}',
      addPointHere: 'Add a point here',
      overlayHillshade: 'Hillshade',
      overlayRelief: 'Elevation colors',
      overlayFlood: 'Flood inundation',
      overlaySediment: 'Sediment hazard zones',
      overlayTsunami: 'Tsunami inundation',
      overlayOpacity: 'Overlay opacity',
      undo: 'Undo',
      redo: 'Redo',
      undoTitle: 'Undo (Ctrl+Z)',
      redoTitle: 'Redo (Ctrl+Shift+Z / Ctrl+Y)',
      undone: 'Undone',
      redone: 'Redone',
      locate: 'Show my location',
      locating: 'Locating...',
      locateError: 'Could not get your location: {message}',
      reshape: 'Edit shape',
      reshapeEditing: 'Editing shape',
      reshapeConfirm: 'Done',
      reshapeHidden: 'Hidden plots cannot be reshaped. Show the tag first.',
      reshapeHintPoint: 'Drag the point to move it, then press Done (Enter) to save. Esc cancels.',
      reshapeHintShape: 'Drag vertices to move, drag midpoints to add, right-click to remove. Press Done (Enter) to save. Esc cancels.',
      reshapeInvalid: 'The shape is invalid, so the change was discarded: {errors}',
      reshapeSaved: 'Shape updated',
      dropHint: 'Drop a file here to load it (YAML / GeoJSON / CSV)',
      importTitle: 'Load data',
      importMessage: 'You already have data ({current} plots).\nAdd the loaded data ({incoming} plots) to it, or replace it?',
      importMerge: 'Add',
      importReplace: 'Replace',
      elevationGet: 'Get elevation',
      elevationLoading: 'Loading...',
      elevationNoData: 'No elevation data for this location.',
      elevationValue: 'Elevation {value} m ({source})',
      elevationSave: 'Save to display fields',
      elevationPropKey: 'Elevation (m)',
      elevationError: 'Could not get the elevation: {message}',
      propertySaved: 'Saved "{key}" to display fields',
      autosaveFailed: 'Autosave failed (browser storage is full). Save to a file instead.'
    }
  };

  var MANUAL = {
    ja: {
      label: '日本語',
      title: '簡易マニュアル',
      sections: [
        ['基本操作', ['「読込」またはファイルのドラッグ&ドロップで、保存済みデータ（YAML / GeoJSON / CSV）を開きます。既にデータがある場合は「追加」か「置き換え」を選べます。', '「サンプル」で付属データを読み込みます。file://で失敗する場合はローカルサーバで開いてください。', '「保存(YAML)」で全体を保存します。「保存(GeoJSON)」でGeoJSONとしても書き出せます。', '操作を誤ったときは「元に戻す」(Ctrl+Z) / 「やり直し」(Ctrl+Shift+Z) が使えます。']],
        ['プロット作成・編集', ['「点」「線」「面」を選び、地図上で作図します。', '表示された編集画面で名称、タグ、表示項目、メモ、写真を設定して保存します。', '一覧または地図上のプロットを選ぶと詳細を確認できます。', '詳細の「形状編集」で点の移動や頂点の編集ができます。「確定」で保存、Escで取消です。', '点の詳細では「標高を取得」で国土地理院の標高を調べ、表示項目に保存できます。']],
        ['場所検索・範囲抽出', ['「場所検索」に住所・地名、または「緯度,経度」を入力して検索します。検索地点はそのまま点として追加できます。', '「矩形選択」を押して地図上をドラッグします（タッチ操作にも対応）。', '判定は「交差」または「内包」から選択できます。', '抽出結果はYAML、GeoJSON、CSVで書き出せます。']],
        ['表示設定', ['背景地図と、陰影起伏図・色別標高図・活断層図・ハザードマップ（洪水・土砂災害・津波）の重ね合わせを切り替えられます。濃さはスライダーで調整します。', 'タグのチェックを外すと、そのタグのプロットを一時的に非表示にできます。', '地図左上の「◎」で現在地を表示します。', '右上のボタンで日本語/英語、ライト/ダークを切り替えられます。']]
      ]
    },
    zh: {
      label: '中文',
      title: '简易手册',
      sections: [
        ['基本操作', ['使用“读取”或将文件拖放到页面上，打开已保存的数据（YAML / GeoJSON / CSV）。如果已有数据，可以选择“追加”或“替换”。', '使用“示例”加载附带数据。如果在 file:// 下失败，请通过本地服务器打开。', '使用“保存(YAML)”保存全部数据，也可用“保存(GeoJSON)”导出 GeoJSON。', '操作有误时可以使用“撤销”(Ctrl+Z) / “重做”(Ctrl+Shift+Z)。']],
        ['创建与编辑标绘', ['选择“点”“线”或“面”，然后在地图上绘制。', '在编辑窗口中设置名称、标签、显示项目、备注和照片后保存。', '点击列表或地图上的标绘对象即可查看详细信息。', '在详细信息中点击“编辑形状”可以移动点或编辑顶点。点击“确定”保存，按 Esc 取消。', '对于点，可以通过“获取标高”查询日本国土地理院的标高，并保存到显示项目。']],
        ['地点搜索与范围提取', ['在“地点搜索”中输入地址、地名或“纬度,经度”进行搜索。搜索到的位置可以直接添加为点。', '点击“矩形选择”，然后在地图上拖拽出范围（支持触摸操作）。', '判定方式可选择“相交”或“包含”。', '提取结果可导出为 YAML、GeoJSON 或 CSV。']],
        ['显示设置', ['可以切换底图，并叠加阴影起伏图、分层设色标高图、活动断层图和灾害风险图（洪水、泥石流等土砂灾害、海啸）。可用滑块调整叠加层的浓度。', '取消标签勾选可临时隐藏该标签的标绘对象。', '点击地图左上角的“◎”显示当前位置。', '右上角按钮可切换日语/英语以及亮色/暗色模式。']]
      ]
    },
    en: {
      label: 'English',
      title: 'Quick Manual',
      sections: [
        ['Basics', ['Use “Load”, or drag and drop a file onto the page, to open saved data (YAML / GeoJSON / CSV). If you already have data, choose “Add” or “Replace”.', 'Use “Sample” to load the bundled sample. If it fails from file://, open the app through a local server.', 'Use “Save YAML” to save everything; “Save GeoJSON” exports GeoJSON as well.', 'Made a mistake? Use “Undo” (Ctrl+Z) and “Redo” (Ctrl+Shift+Z).']],
        ['Creating and Editing Plots', ['Choose “Point”, “Line”, or “Polygon”, then draw on the map.', 'Set the name, tag, display fields, notes, and photos in the editor, then save.', 'Select a plot from the list or the map to view its details.', 'Use “Edit shape” in the details to move a point or edit vertices. Press “Done” to save or Esc to cancel.', 'For points, “Get elevation” looks up the GSI elevation, which you can save to the display fields.']],
        ['Place Search and Area Extract', ['Type an address, a place name, or “lat,lng” into “Place Search”. The found location can be added as a point.', 'Press “Rectangle” and drag on the map (touch is supported).', 'Choose either “Intersect” or “Within” for the selection mode.', 'Export results as YAML, GeoJSON, or CSV.']],
        ['Display Settings', ['Switch base maps and overlay hillshade, elevation colors, active faults, and hazard maps (flood, sediment, tsunami). Adjust the overlay opacity with the slider.', 'Uncheck a tag to temporarily hide its plots.', 'Press “◎” at the top left of the map to show your location.', 'Use the top-right buttons to switch Japanese/English and Light/Dark modes.']]
      ]
    }
  };

  function t(key, vars) {
    var dict = M[currentLang] || {};
    var text = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] :
      (Object.prototype.hasOwnProperty.call(M.ja, key) ? M.ja[key] : key);
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, function (_, k) {
      return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : '';
    });
  }

  function init() {
    var savedLang = getStored(LANG_KEY);
    currentLang = savedLang === 'en' ? 'en' : 'ja';
    var savedTheme = getStored(THEME_KEY);
    currentTheme = savedTheme === 'dark' ? 'dark' : 'light';
    applyTheme();
    renderStatic();
    wireControls();
  }

  function wireControls() {
    var langBtn = document.getElementById('btnLangToggle');
    if (langBtn) langBtn.addEventListener('click', function () { setLanguage(currentLang === 'ja' ? 'en' : 'ja'); });
    var themeBtn = document.getElementById('btnThemeToggle');
    if (themeBtn) themeBtn.addEventListener('click', function () { setTheme(currentTheme === 'light' ? 'dark' : 'light'); });
    var manualBtn = document.getElementById('btnManual');
    if (manualBtn) manualBtn.addEventListener('click', function () { showManual(currentLang === 'en' ? 'en' : 'ja'); });
  }

  function setLanguage(lang) {
    currentLang = lang === 'en' ? 'en' : 'ja';
    setStored(LANG_KEY, currentLang);
    renderStatic();
    subscribers.forEach(function (fn) { fn(currentLang); });
  }

  function setTheme(theme) {
    currentTheme = theme === 'dark' ? 'dark' : 'light';
    setStored(THEME_KEY, currentTheme);
    applyTheme();
    renderStatic();
  }

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', currentTheme);
    document.documentElement.style.colorScheme = currentTheme;
    var metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.setAttribute('content', currentTheme === 'dark' ? '#0f172a' : '#1f2933');
  }

  function renderStatic(root) {
    root = root || document;
    document.documentElement.lang = currentLang;
    document.title = t('title');
    root.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    root.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      el.title = t(el.getAttribute('data-i18n-title'));
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
    root.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });
    var langBtn = document.getElementById('btnLangToggle');
    if (langBtn) langBtn.textContent = t('langToggle');
    var themeBtn = document.getElementById('btnThemeToggle');
    if (themeBtn) themeBtn.textContent = t(currentTheme === 'light' ? 'themeToggleDark' : 'themeToggleLight');
  }

  function showManual(lang) {
    var manualLang = MANUAL[lang] ? lang : 'ja';
    var back = document.createElement('div');
    back.className = 'mpv-modal mpv-manual-modal';
    back.innerHTML =
      '<div class="mpv-modal__box mpv-manual" role="dialog" aria-modal="true">' +
      '<header><div><h3></h3><p></p></div><button type="button" class="mpv-modal__x" aria-label="' + esc(t('close')) + '">x</button></header>' +
      '<div class="mpv-manual__tabs"></div>' +
      '<div class="mpv-modal__body mpv-manual__body"></div>' +
      '<footer><button type="button" class="mpv-ok">' + esc(t('close')) + '</button></footer>' +
      '</div>';
    document.body.appendChild(back);

    function render(langKey) {
      manualLang = langKey;
      var data = MANUAL[manualLang];
      back.querySelector('h3').textContent = data.title;
      back.querySelector('p').textContent = t('manualIntro');
      back.querySelector('.mpv-manual__tabs').innerHTML = Object.keys(MANUAL).map(function (k) {
        return '<button type="button" data-lang="' + k + '" class="' + (k === manualLang ? 'is-active' : '') + '">' + esc(MANUAL[k].label) + '</button>';
      }).join('');
      back.querySelector('.mpv-manual__body').innerHTML = data.sections.map(function (section) {
        return '<section><h4>' + esc(section[0]) + '</h4><ol>' +
          section[1].map(function (item) { return '<li>' + esc(item) + '</li>'; }).join('') +
          '</ol></section>';
      }).join('');
      back.querySelectorAll('.mpv-manual__tabs button').forEach(function (btn) {
        btn.addEventListener('click', function () { render(btn.getAttribute('data-lang')); });
      });
    }

    function close() {
      if (back.parentNode) back.parentNode.removeChild(back);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') close(); }
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    back.querySelector('.mpv-modal__x').addEventListener('click', close);
    back.querySelector('.mpv-ok').addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    render(manualLang);
  }

  function subscribe(fn) {
    if (typeof fn === 'function') subscribers.push(fn);
  }

  function typeLabel(type) {
    return t(type) || type;
  }

  function getStored(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function setStored(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* ignore */ }
  }
  function esc(s) {
    return global.Util.escapeHtml(s == null ? '' : s);
  }

  global.I18n = {
    init: init,
    t: t,
    setLanguage: setLanguage,
    setTheme: setTheme,
    renderStatic: renderStatic,
    showManual: showManual,
    subscribe: subscribe,
    typeLabel: typeLabel,
    getLanguage: function () { return currentLang; },
    getTheme: function () { return currentTheme; }
  };
})(typeof window !== 'undefined' ? window : this);
