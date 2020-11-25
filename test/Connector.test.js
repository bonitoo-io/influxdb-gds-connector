DataStudioApp = jest.fn()
DataStudioApp.createCommunityConnector = jest.fn()

Logger = jest.fn()
Logger.log = jest.fn()

let cache = {}
cache.get = jest.fn(() => null)
cache.put = jest.fn()

CacheService = jest.fn()
CacheService.getScriptCache = jest.fn(() => cache)

Utilities = jest.fn()
Utilities.DigestAlgorithm = jest.fn()
Utilities.Charset = jest.fn()
Utilities.computeDigest = jest.fn(it => it)
Utilities.base64Encode = jest.fn(it => it)
let blob = {}
blob.getBytes = jest.fn(it => it)
Utilities.newBlob = jest.fn(() => blob)
Utilities.gzip = jest.fn(it => it)

InfluxDBClient = jest.fn().mockImplementation(() => {
  return {
    validateConfig: jest.fn(),
    getFields: jest.fn(() => []),
    getData: jest.fn(() => []),
  }
})
const connector = require('../src/Connector')

test('getAuthType', () => {
  expect(connector.getAuthType()).toEqual({type: 'NONE'})
})

test('isAdminUser', () => {
  expect(connector.isAdminUser()).toEqual(false)
})

test('getData', () => {
  expect(
    connector.getData({
      fields: [],
      configParams: {
        INFLUXDB_URL: 'http://localhost:8086',
        INFLUXDB_TOKEN: 'my-token',
        INFLUXDB_ORG: 'my-org',
      },
    })
  ).toEqual({
    filtersApplied: false,
    rows: [],
    schema: [],
  })
})
