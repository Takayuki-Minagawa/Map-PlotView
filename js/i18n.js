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
      loadYaml: '読込(YAML)',
      saveYaml: '保存(YAML)',
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
      warningFeatureInvalid: 'features[{index}] ({id}): {errors}',
      warningUnknownTag: 'features[{index}] ({id}): タグ "{tag}" が未定義のため「未分類」に変更'
    },
    en: {
      title: 'Map PlotView - Map Plotting Tool',
      manualOpen: 'Manual',
      loadYaml: 'Load YAML',
      saveYaml: 'Save YAML',
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
      warningFeatureInvalid: 'features[{index}] ({id}): {errors}',
      warningUnknownTag: 'features[{index}] ({id}): tag "{tag}" is undefined, changed to Uncategorized'
    }
  };

  var MANUAL = {
    ja: {
      label: '日本語',
      title: '簡易マニュアル',
      sections: [
        ['基本操作', ['「読込(YAML)」で保存済みデータを開きます。', '「サンプル」で付属データを読み込みます。file://で失敗する場合はローカルサーバで開いてください。', '「保存(YAML)」で現在のタグ、プロット、表示位置を保存します。']],
        ['プロット作成', ['「点」「線」「面」を選び、地図上で作図します。', '表示された編集画面で名称、タグ、表示項目、メモ、写真を設定して保存します。', '一覧または地図上のプロットを選ぶと詳細を確認できます。']],
        ['範囲抽出', ['「矩形選択」を押して地図上をドラッグします。', '判定は「交差」または「内包」から選択できます。', '抽出結果はYAML、GeoJSON、CSVで書き出せます。']],
        ['表示設定', ['背景地図や活断層図を切り替えられます。', 'タグのチェックを外すと、そのタグのプロットを一時的に非表示にできます。', '右上のボタンで日本語/英語、ライト/ダークを切り替えられます。']]
      ]
    },
    zh: {
      label: '中文',
      title: '简易手册',
      sections: [
        ['基本操作', ['使用“加载 YAML”打开已保存的数据。', '使用“示例”加载附带数据。如果在 file:// 下失败，请通过本地服务器打开。', '使用“保存 YAML”保存当前标签、标绘对象和地图视图。']],
        ['创建标绘', ['选择“点”“线”或“面”，然后在地图上绘制。', '在编辑窗口中设置名称、标签、显示项目、备注和照片后保存。', '点击列表或地图上的标绘对象即可查看详细信息。']],
        ['范围提取', ['点击“矩形选择”，然后在地图上拖拽出范围。', '判定方式可选择“相交”或“包含”。', '提取结果可导出为 YAML、GeoJSON 或 CSV。']],
        ['显示设置', ['可以切换底图和活动断层图层。', '取消标签勾选可临时隐藏该标签的标绘对象。', '右上角按钮可切换日语/英语以及亮色/暗色模式。']]
      ]
    },
    en: {
      label: 'English',
      title: 'Quick Manual',
      sections: [
        ['Basics', ['Use “Load YAML” to open saved data.', 'Use “Sample” to load the bundled sample. If it fails from file://, open the app through a local server.', 'Use “Save YAML” to save the current tags, plots, and map view.']],
        ['Creating Plots', ['Choose “Point”, “Line”, or “Polygon”, then draw on the map.', 'Set the name, tag, display fields, notes, and photos in the editor, then save.', 'Select a plot from the list or the map to view its details.']],
        ['Area Extract', ['Press “Rectangle” and drag on the map.', 'Choose either “Intersect” or “Within” for the selection mode.', 'Export results as YAML, GeoJSON, or CSV.']],
        ['Display Settings', ['Switch base maps and the active fault overlay as needed.', 'Uncheck a tag to temporarily hide its plots.', 'Use the top-right buttons to switch Japanese/English and Light/Dark modes.']]
      ]
    }
  };

  function t(key, vars) {
    var text = (M[currentLang] && M[currentLang][key]) || M.ja[key] || key;
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
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
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
