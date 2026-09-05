const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const babel = require('@babel/core');

const source = fs.readFileSync(path.join(__dirname, '../src/weather.js'), 'utf8');
const { code } = babel.transformSync(source, {
  babelrc: false,
  configFile: false,
  presets: [['@babel/preset-env', { targets: { node: 'current' }, modules: 'commonjs' }]],
});
const exportsObject = {};
// Weather icons are irrelevant to localization; preserve their import identifiers.
vm.runInNewContext(code, { exports: exportsObject, require: (icon) => icon });
const WeatherEntity = exportsObject.default;
const entity = { state: 'sunny', attributes: { temperature: 22 } };
const currentKey = 'component.weather.entity_component._.state.sunny';
const legacyKey = 'component.weather.state._.sunny';

test('renders translated conditions with localize and no resources property', () => {
  const hass = {
    language: 'en',
    translations: { [currentKey]: 'Sunny' },
    localize(key) { return this.translations[key]; },
  };
  assert.equal(new WeatherEntity(hass, entity).state, 'Sunny');
});

test('falls back to the raw condition while translations are unavailable', () => {
  assert.equal(new WeatherEntity({ language: 'en', localize: () => undefined }, entity).state, 'sunny');
  assert.equal(new WeatherEntity({ language: 'en' }, entity).state, 'sunny');
});

test('supports the old translation key through localize', () => {
  const hass = { localize: (key) => key === legacyKey ? 'Sunny (legacy)' : '' };
  assert.equal(new WeatherEntity(hass, entity).state, 'Sunny (legacy)');
});

test('retains compatibility with legacy resources and selected language', () => {
  const hass = {
    language: 'en',
    selectedLanguage: 'de',
    resources: { de: { [legacyKey]: 'Sonnig' } },
  };
  assert.equal(new WeatherEntity(hass, entity).state, 'Sonnig');
});

test('handles missing language resources without throwing', () => {
  const hass = { language: 'en', resources: {} };
  assert.equal(new WeatherEntity(hass, entity).state, 'sunny');
});

test('localizes other labels without requiring legacy resources', () => {
  const hass = { localize: (key) => key === 'state.default.unknown' ? 'Unknown' : '' };
  assert.equal(new WeatherEntity(hass, entity).wind_bearing, 'Unknown');
});

test('renders zero degrees as north and other numeric bearings correctly', () => {
  for (const [bearing, expected] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W'], [360, 'N']]) {
    const weather = new WeatherEntity({}, { ...entity, attributes: { wind_bearing: bearing } });
    assert.equal(weather.wind_bearing, expected);
  }
});

test('uses the unknown label for missing or invalid wind bearings', () => {
  const hass = { localize: () => 'Unknown' };
  for (const bearing of [undefined, null, NaN, Infinity, '', 'undefined']) {
    const weather = new WeatherEntity(hass, { ...entity, attributes: { wind_bearing: bearing } });
    assert.equal(weather.wind_bearing, 'Unknown');
  }
});
