const require_import = require('../src/InfluxDBClient')

let client

beforeEach(() => {
  client = new require_import.InfluxDBClient()
  UrlFetchApp = jest.fn()
  UrlFetchApp.fetch = jest.fn()

  let httpResponse = jest.fn()
  httpResponse.getContentText = jest.fn()

  UrlFetchApp.fetch.mockReturnValue(httpResponse)

  Utilities = jest.fn()
  Utilities.parseCsv = jest.fn()

  Logger = jest.fn()
  Logger.log = jest.fn()
})

describe('get buckets', () => {
  test('success', () => {
    // noinspection JSConsecutiveCommasInArrayLiteral
    const csv = [
      [, 'result', 'table', '_value'],
      [, '_result', 0, 'HEALTH'],
      [, '_result', 0, '_monitoring'],
      [, '_result', 0, '_tasks'],
      [, '_result', 0, 'github'],
      [, , ,],
    ]

    Utilities.parseCsv.mockReturnValue(csv)

    let configParams = {}
    configParams.INFLUXDB_URL = 'http://localhost:8086'
    configParams.INFLUXDB_TOKEN = 'my-token'
    configParams.INFLUXDB_ORG = 'my-org'

    let buckets = client.getBuckets(configParams)
    expect(UrlFetchApp.fetch.mock.calls.length).toBe(1)
    expect(UrlFetchApp.fetch.mock.calls[0][0]).toBe(
      'http://localhost:8086/api/v2/query?org=my-org'
    )
    expect(UrlFetchApp.fetch.mock.calls[0][1]).toStrictEqual({
      contentType: 'application/vnd.flux',
      headers: {
        Accept: 'application/csv',
        Authorization: 'Token my-token',
        'User-Agent': 'influxdb-gds-connector',
      },
      method: 'post',
      payload: `buckets() |> rename(columns: {"name": "_value"}) |> keep(columns: ["_value"]) |> sort(columns: ["_value"], desc: false)`,
    })

    expect(buckets).toHaveLength(4)
    expect(buckets).toEqual(['HEALTH', '_monitoring', '_tasks', 'github'])
  })
})

describe('get measurements', () => {
  test('success', () => {
    // noinspection JSConsecutiveCommasInArrayLiteral
    const csv = [
      [, 'result', 'table', '_value'],
      [, '_result', 0, 'circleci'],
      [, '_result', 0, 'github_repository'],
      [, , ,],
    ]

    Utilities.parseCsv.mockReturnValue(csv)

    let configParams = {}
    configParams.INFLUXDB_URL = 'http://localhost:8086'
    configParams.INFLUXDB_TOKEN = 'my-token'
    configParams.INFLUXDB_ORG = 'my-org'
    configParams.INFLUXDB_BUCKET = 'my-bucket'

    let buckets = client.getMeasurements(configParams)
    expect(UrlFetchApp.fetch.mock.calls.length).toBe(1)
    expect(UrlFetchApp.fetch.mock.calls[0][0]).toBe(
      'http://localhost:8086/api/v2/query?org=my-org'
    )
    expect(UrlFetchApp.fetch.mock.calls[0][1]).toStrictEqual({
      contentType: 'application/vnd.flux',
      headers: {
        Accept: 'application/csv',
        Authorization: 'Token my-token',
        'User-Agent': 'influxdb-gds-connector',
      },
      method: 'post',
      payload: `import "influxdata/influxdb/v1"

v1.tagValues(
  bucket: "my-bucket",
  tag: "_measurement",
  predicate: (r) => true,
  start: duration(v: uint(v: 1970-01-01) - uint(v: now()))
)`,
    })

    expect(buckets).toHaveLength(2)
    expect(buckets).toEqual(['circleci', 'github_repository'])
  })
})

describe('get fields', () => {
  let configParams = {}
  configParams.INFLUXDB_URL = 'http://localhost:8086'
  configParams.INFLUXDB_TOKEN = 'my-token'
  configParams.INFLUXDB_ORG = 'my-org'
  configParams.INFLUXDB_BUCKET = 'my-bucket'
  configParams.INFLUXDB_MEASUREMENT = 'circleci'

  beforeEach(() => {
    Utilities.parseCsv.mockImplementation(rows => {
      return rows.split('\n').map(row => row.trim().split(','))
    })
  })

  test('success', () => {
    const fs = require('fs')
    const csv = fs.readFileSync(__dirname + '/schema1.csv', 'utf8')
    let httpResponse = jest.fn()
    httpResponse.getContentText = jest.fn()
    httpResponse.getContentText.mockReturnValue(csv)

    UrlFetchApp.fetch.mockReturnValue(httpResponse)

    let fields = client.getFields(configParams)
    expect(UrlFetchApp.fetch.mock.calls.length).toBe(1)
    expect(UrlFetchApp.fetch.mock.calls[0][0]).toBe(
      'http://localhost:8086/api/v2/query?org=my-org'
    )
    expect(UrlFetchApp.fetch.mock.calls[0][1]).toStrictEqual({
      contentType: 'application/json',
      headers: {
        Accept: 'application/csv',
        Authorization: 'Token my-token',
        'User-Agent': 'influxdb-gds-connector',
      },
      method: 'post',
      payload: `{"query":\"import \\"influxdata/influxdb/v1\\" bucket = \\"my-bucket\\" measurement = \\"circleci\\" start_range = duration(v: uint(v: 1970-01-01) - uint(v: now())) v1.tagKeys( bucket: bucket, predicate: (r) => r._measurement == measurement, start: start_range ) |> filter(fn: (r) => r._value != \\"_start\\" and r._value != \\"_stop\\" and r._value != \\"_measurement\\" and r._value != \\"_field\\") |> yield(name: \\"tags\\") from(bucket: bucket) |> range(start: start_range) |> filter(fn: (r) => r[\\"_measurement\\"] == measurement) |> keep(fn: (column) => column == \\"_field\\" or column == \\"_value\\") |> unique(column: \\"_field\\") |> yield(name: \\"fields\\")", "type":"flux", "dialect":{"header":true,"delimiter":",","annotations":["datatype","group","default"],"commentPrefix":"#","dateTimeFormat":"RFC3339"}}`,
    })

    expect(fields).toHaveLength(11)
    expect(fields[0]).toEqual({
      dataType: 'STRING',
      label: 'measurement',
      name: '_measurement',
      semantics: {
        conceptType: 'DIMENSION',
      },
    })
    expect(fields[1]).toEqual({
      dataType: 'STRING',
      label: 'host',
      name: 'host',
      semantics: {
        conceptType: 'DIMENSION',
      },
    })
    expect(fields[2]).toEqual({
      dataType: 'STRING',
      label: 'reponame',
      name: 'reponame',
      semantics: {
        conceptType: 'DIMENSION',
      },
    })
    expect(fields[3]).toEqual({
      dataType: 'STRING',
      label: 'vcs_url',
      name: 'vcs_url',
      semantics: {
        conceptType: 'DIMENSION',
      },
    })
    expect(fields[4]).toEqual({
      dataType: 'BOOLEAN',
      label: 'fieldBool',
      name: 'fieldBool',
      semantics: {
        conceptType: 'METRIC',
        isReaggregatable: false,
      },
    })
    expect(fields[5]).toEqual({
      dataType: 'NUMBER',
      label: 'fieldFloat',
      name: 'fieldFloat',
      semantics: {
        conceptType: 'METRIC',
        isReaggregatable: true,
        semanticGroup: 'NUMBER',
      },
    })
    expect(fields[6]).toEqual({
      dataType: 'NUMBER',
      label: 'fieldInteger',
      name: 'fieldInteger',
      semantics: {
        conceptType: 'METRIC',
        isReaggregatable: true,
        semanticGroup: 'NUMBER',
      },
    })
    expect(fields[7]).toEqual({
      dataType: 'STRING',
      label: 'fieldString',
      name: 'fieldString',
      semantics: {
        conceptType: 'METRIC',
        isReaggregatable: false,
      },
    })
    expect(fields[8]).toEqual({
      dataType: 'NUMBER',
      label: 'fieldUInteger',
      name: 'fieldUInteger',
      semantics: {
        conceptType: 'METRIC',
        isReaggregatable: true,
        semanticGroup: 'NUMBER',
      },
    })
    expect(fields[9]).toEqual({
      dataType: 'STRING',
      label: 'fieldDate',
      name: 'fieldDate',
      semantics: {
        conceptType: 'METRIC',
        isReaggregatable: false,
        semanticGroup: 'DATETIME',
        semanticType: 'YEAR_MONTH_DAY_SECOND',
      },
    })
    expect(fields[10]).toEqual({
      dataType: 'STRING',
      label: 'time',
      name: '_time',
      semantics: {
        conceptType: 'DIMENSION',
        isReaggregatable: false,
        semanticGroup: 'DATETIME',
        semanticType: 'YEAR_MONTH_DAY_SECOND',
      },
    })
  })

  test('replace spaces in name', () => {
    const fs = require('fs')
    const csv = fs.readFileSync(__dirname + '/schema2.csv', 'utf8')
    let httpResponse = jest.fn()
    httpResponse.getContentText = jest.fn()
    httpResponse.getContentText.mockReturnValue(csv)

    UrlFetchApp.fetch.mockReturnValue(httpResponse)

    let names = client.getFields(configParams).map(function (field) {
      return field.name
    })
    expect(names).toHaveLength(13)
    expect(names).toEqual([
      '_measurement',
      'Entity',
      'ISO__space__code',
      '7__minus__day__space__smoothed__space__daily__space__change',
      '7__minus__day__space__smoothed__space__daily__space__change__space__per__space__thousand',
      'Cumulative__space__total',
      'Cumulative__space__total__space__per__space__thousand',
      'Daily__space__change__space__in__space__cumulative__space__total',
      'Daily__space__change__space__in__space__cumulative__space__total__space__per__space__thousand',
      'Notes',
      'Source__space__URL',
      'Source__space__label',
      '_time',
    ])
  })

  test('COVID-19 template', () => {
    const fs = require('fs')
    const csv = fs.readFileSync(__dirname + '/schema3.csv', 'utf8')
    let httpResponse = jest.fn()
    httpResponse.getContentText = jest.fn()
    httpResponse.getContentText.mockReturnValue(csv)

    UrlFetchApp.fetch.mockReturnValue(httpResponse)

    let fields = client.getFields(configParams)
    expect(fields).toHaveLength(7)
    expect(fields[0]).toEqual({
      dataType: 'STRING',
      label: 'measurement',
      name: '_measurement',
      semantics: {
        conceptType: 'DIMENSION',
      },
    })
    expect(fields[1]).toEqual({
      dataType: 'STRING',
      label: 'location',
      name: 'location',
      semantics: {
        conceptType: 'DIMENSION',
      },
    })
    expect(fields[2]).toEqual({
      dataType: 'NUMBER',
      label: 'RecoveredChange',
      name: 'RecoveredChange',
      semantics: {
        conceptType: 'METRIC',
        isReaggregatable: true,
        semanticGroup: 'NUMBER',
      },
    })
    expect(fields[3]).toEqual({
      dataType: 'NUMBER',
      label: 'new_cases',
      name: 'new_cases',
      semantics: {
        conceptType: 'METRIC',
        isReaggregatable: true,
        semanticGroup: 'NUMBER',
      },
    })
    expect(fields[4]).toEqual({
      dataType: 'NUMBER',
      label: 'new_deaths',
      name: 'new_deaths',
      semantics: {
        conceptType: 'METRIC',
        isReaggregatable: true,
        semanticGroup: 'NUMBER',
      },
    })
    expect(fields[5]).toEqual({
      dataType: 'NUMBER',
      label: 'population',
      name: 'population',
      semantics: {
        conceptType: 'METRIC',
        isReaggregatable: true,
        semanticGroup: 'NUMBER',
      },
    })
    expect(fields[6]).toEqual({
      dataType: 'STRING',
      label: 'time',
      name: '_time',
      semantics: {
        conceptType: 'DIMENSION',
        isReaggregatable: false,
        semanticGroup: 'DATETIME',
        semanticType: 'YEAR_MONTH_DAY_SECOND',
      },
    })
  })

  test('Large Schema', () => {
    const fs = require('fs')
    const csv = fs.readFileSync(__dirname + '/schema4.csv', 'utf8')
    let httpResponse = jest.fn()
    httpResponse.getContentText = jest.fn()
    httpResponse.getContentText.mockReturnValue(csv)

    UrlFetchApp.fetch.mockReturnValue(httpResponse)

    let fields = client.getFields(configParams)
    // cat schema4.csv | grep -v "^#" | grep -v "^[[:space:]]*$" | grep -v "^,result" | wc -l
    expect(fields).toHaveLength(1087 + 2)

    expect(fields[0]).toEqual({
      dataType: 'STRING',
      label: 'measurement',
      name: '_measurement',
      semantics: {
        conceptType: 'DIMENSION',
      },
    })
    expect(fields[1]).toEqual({
      dataType: 'STRING',
      label: 'Cycle_Number',
      name: 'Cycle_Number',
      semantics: {
        conceptType: 'DIMENSION',
      },
    })
    expect(fields[2]).toEqual({
      dataType: 'STRING',
      label: 'Device',
      name: 'Device',
      semantics: {
        conceptType: 'DIMENSION',
      },
    })
    expect(fields[3]).toEqual({
      dataType: 'STRING',
      label: 'EWONTime',
      name: 'EWONTime',
      semantics: {
        conceptType: 'DIMENSION',
      },
    })
    expect(fields[4]).toEqual({
      dataType: 'STRING',
      label: 'Location',
      name: 'Location',
      semantics: {
        conceptType: 'DIMENSION',
      },
    })
    expect(fields[5]).toEqual({
      dataType: 'STRING',
      label: 'TimeStamp',
      name: 'TimeStamp',
      semantics: {
        conceptType: 'DIMENSION',
      },
    })
    expect(fields[6]).toEqual({
      dataType: 'STRING',
      label: 'host',
      name: 'host',
      semantics: {
        conceptType: 'DIMENSION',
      },
    })
    expect(fields[7]).toEqual({
      dataType: 'STRING',
      label: 'method',
      name: 'method',
      semantics: {
        conceptType: 'DIMENSION',
      },
    })
    expect(fields[8]).toEqual({
      dataType: 'STRING',
      label: 'upload',
      name: 'upload',
      semantics: {
        conceptType: 'DIMENSION',
      },
    })
    expect(fields[108]).toEqual({
      dataType: 'NUMBER',
      label: '1.Application.Global_Variables.Tag98',
      name: '1.Application.Global_Variables.Tag98',
      semantics: {
        conceptType: 'METRIC',
        isReaggregatable: true,
        semanticGroup: 'NUMBER',
      },
    })
    expect(fields[208]).toEqual({
      dataType: 'NUMBER',
      label: 'LC600.MainProgram.VslPressBar',
      name: 'LC600.MainProgram.VslPressBar',
      semantics: {
        conceptType: 'METRIC',
        isReaggregatable: true,
        semanticGroup: 'NUMBER',
      },
    })
    expect(fields[308]).toEqual({
      dataType: 'BOOLEAN',
      label: 'MainProgram.ipflagDoorOpenFull',
      name: 'MainProgram.ipflagDoorOpenFull',
      semantics: {
        conceptType: 'METRIC',
        isReaggregatable: false,
      },
    })
    expect(fields[408]).toEqual({
      dataType: 'BOOLEAN',
      label: 'PLC.DB41.pbSampleAck',
      name: 'PLC.DB41.pbSampleAck',
      semantics: {
        conceptType: 'METRIC',
        isReaggregatable: false,
      },
    })
    expect(fields[508]).toEqual({
      dataType: 'NUMBER',
      label: 'PLC.DB43.ChemChemAdditionSecs',
      name: 'PLC.DB43.ChemChemAdditionSecs',
      semantics: {
        conceptType: 'METRIC',
        isReaggregatable: true,
        semanticGroup: 'NUMBER',
      },
    })
    expect(fields[608]).toEqual({
      dataType: 'NUMBER',
      label: 'PLC.DB43.spTimeTo250',
      name: 'PLC.DB43.spTimeTo250',
      semantics: {
        conceptType: 'METRIC',
        isReaggregatable: true,
        semanticGroup: 'NUMBER',
      },
    })
    expect(fields[708]).toEqual({
      dataType: 'NUMBER',
      label: 'PLC.DB55.stDrainTemp_C',
      name: 'PLC.DB55.stDrainTemp_C',
      semantics: {
        conceptType: 'METRIC',
        isReaggregatable: true,
        semanticGroup: 'NUMBER',
      },
    })
    expect(fields[808]).toEqual({
      dataType: 'BOOLEAN',
      label: 'PLC.audAlarm',
      name: 'PLC.audAlarm',
      semantics: {
        conceptType: 'METRIC',
        isReaggregatable: false,
      },
    })
    expect(fields[908]).toEqual({
      dataType: 'NUMBER',
      label: 'PLC.ptxRecircDisch',
      name: 'PLC.ptxRecircDisch',
      semantics: {
        conceptType: 'METRIC',
        isReaggregatable: true,
        semanticGroup: 'NUMBER',
      },
    })
    expect(fields[1008]).toEqual({
      dataType: 'BOOLEAN',
      label: 'S7-1200.crNotOverPressure',
      name: 'S7__minus__1200.crNotOverPressure',
      semantics: {
        conceptType: 'METRIC',
        isReaggregatable: false,
      },
    })
    expect(fields[1088]).toEqual({
      dataType: 'STRING',
      label: 'time',
      name: '_time',
      semantics: {
        conceptType: 'DIMENSION',
        isReaggregatable: false,
        semanticGroup: 'DATETIME',
        semanticType: 'YEAR_MONTH_DAY_SECOND',
      },
    })
  })
})

describe('get data', () => {
  let configParams
  let fields = [
    {name: 'host', dataType: 'STRING'},
    {name: 'reponame', dataType: 'STRING'},
    {name: 'vcs_url', dataType: 'STRING'},
    {name: 'author_email', dataType: 'STRING'},
    {name: 'author_name', dataType: 'STRING'},
    {name: 'build_num', dataType: 'NUMBER'},
    {name: 'build_time_millis', dataType: 'NUMBER'},
    {name: 'failed', dataType: 'BOOLEAN'},
    {name: 'lifecycle', dataType: 'STRING'},
    {name: 'parallel', dataType: 'NUMBER'},
    {name: 'previous_build_num', dataType: 'NUMBER'},
    {name: 'previous_build_time_millis', dataType: 'NUMBER'},
    {name: 'status', dataType: 'STRING'},
    {name: 'user_id', dataType: 'NUMBER'},
  ]

  beforeEach(() => {
    const fs = require('fs')
    const csv = fs.readFileSync(__dirname + '/data.csv', 'utf8')
    let httpResponse = jest.fn()
    httpResponse.getContentText = jest.fn()
    httpResponse.getContentText.mockReturnValue(csv)

    UrlFetchApp.fetch.mockReturnValue(httpResponse)

    configParams = {}
    configParams.INFLUXDB_URL = 'http://localhost:8086'
    configParams.INFLUXDB_TOKEN = 'my-token'
    configParams.INFLUXDB_ORG = 'my-org'
    configParams.INFLUXDB_BUCKET = 'my-bucket'
    configParams.INFLUXDB_MEASUREMENT = 'circleci'

    Utilities.parseCsv.mockImplementation(rows => {
      return rows.split('\n').map(row => row.trim().split(','))
    })
  })

  test('success', () => {
    let rows = client.getData(
      configParams,
      {sampleExtraction: false},
      {startDate: '2020-04-20', endDate: '2020-05-20'},
      fields
    )

    expect(UrlFetchApp.fetch.mock.calls.length).toBe(1)
    expect(UrlFetchApp.fetch.mock.calls[0][0]).toBe(
      'http://localhost:8086/api/v2/query?org=my-org'
    )
    expect(UrlFetchApp.fetch.mock.calls[0][1]).toStrictEqual({
      contentType: 'application/json',
      headers: {
        Accept: 'application/csv',
        Authorization: 'Token my-token',
        'User-Agent': 'influxdb-gds-connector',
      },
      method: 'post',
      payload: `{"query":"from(bucket: \\"my-bucket\\") |> range(start: 2020-04-20T00:00:00Z, stop: 2020-05-20T23:59:59Z) |> filter(fn: (r) => r[\\"_measurement\\"] == \\"circleci\\") |> pivot(rowKey:[\\"_time\\"], columnKey: [\\"_field\\"], valueColumn: \\"_value\\")  ", "type":"flux", "dialect":{"header":true,"delimiter":",","annotations":["datatype","group","default"],"commentPrefix":"#","dateTimeFormat":"RFC3339"}}`,
    })

    expect(rows).toHaveLength(19)
    rows.forEach(row => expect(row.values).toHaveLength(14))
    expect(rows[0].values).toEqual([
      undefined,
      'influxdb-client-csharp',
      'https://github.com/influxdata/influxdb-client-csharp',
      undefined,
      undefined,
      789,
      179493,
      false,
      'finished',
      1,
      788,
      185724,
      'success',
      undefined,
    ])
    expect(rows[3].values).toEqual([
      undefined,
      'influxdb-client-java',
      'https://github.com/influxdata/influxdb-client-java',
      undefined,
      undefined,
      1344,
      479751,
      false,
      'finished',
      1,
      1343,
      512297,
      'success',
      undefined,
    ])
    expect(rows[9].values).toEqual([
      undefined,
      'influxdb-client-js',
      'https://github.com/influxdata/influxdb-client-js',
      'tom.hol@example.com',
      'Tom Hol',
      278,
      39448,
      false,
      'finished',
      1,
      277,
      45805,
      'success',
      16321466,
    ])
    expect(rows[13].values).toEqual([
      undefined,
      'influxdb-client-php',
      'https://github.com/influxdata/influxdb-client-php',
      undefined,
      undefined,
      547,
      105698,
      false,
      'finished',
      1,
      546,
      115977,
      'success',
      undefined,
    ])
    expect(rows[16].values).toEqual([
      undefined,
      'influxdb-client-python',
      'https://github.com/influxdata/influxdb-client-python',
      undefined,
      undefined,
      750,
      165210,
      false,
      'finished',
      1,
      749,
      136741,
      'success',
      undefined,
    ])
  })

  test('specified fields', () => {
    let rows = client.getData(
      configParams,
      {sampleExtraction: false},
      {startDate: '2020-04-20', endDate: '2020-05-20'},
      [
        {name: 'reponame', dataType: 'STRING'},
        {name: 'build_num', dataType: 'NUMBER'},
        {name: 'user_id', dataType: 'NUMBER'},
        {name: 'failed', dataType: 'BOOLEAN'},
        {name: 'build_time_millis', dataType: 'NUMBER'},
      ]
    )

    expect(UrlFetchApp.fetch.mock.calls.length).toBe(1)
    expect(UrlFetchApp.fetch.mock.calls[0][0]).toBe(
      'http://localhost:8086/api/v2/query?org=my-org'
    )
    expect(UrlFetchApp.fetch.mock.calls[0][1]).toStrictEqual({
      contentType: 'application/json',
      headers: {
        Accept: 'application/csv',
        Authorization: 'Token my-token',
        'User-Agent': 'influxdb-gds-connector',
      },
      method: 'post',
      payload: `{"query":"from(bucket: \\"my-bucket\\") |> range(start: 2020-04-20T00:00:00Z, stop: 2020-05-20T23:59:59Z) |> filter(fn: (r) => r[\\"_measurement\\"] == \\"circleci\\") |> pivot(rowKey:[\\"_time\\"], columnKey: [\\"_field\\"], valueColumn: \\"_value\\")  ", "type":"flux", "dialect":{"header":true,"delimiter":",","annotations":["datatype","group","default"],"commentPrefix":"#","dateTimeFormat":"RFC3339"}}`,
    })

    expect(rows).toHaveLength(19)
    rows.forEach(row => expect(row.values).toHaveLength(5))
    expect(rows[0].values).toEqual([
      'influxdb-client-csharp',
      789,
      undefined,
      false,
      179493,
    ])
    expect(rows[1].values).toEqual([
      'influxdb-client-csharp',
      790,
      undefined,
      false,
      192074,
    ])
    expect(rows[2].values).toEqual([
      'influxdb-client-csharp',
      791,
      undefined,
      false,
      190784,
    ])
    expect(rows[3].values).toEqual([
      'influxdb-client-java',
      1344,
      undefined,
      false,
      479751,
    ])
    expect(rows[4].values).toEqual([
      'influxdb-client-java',
      1343,
      undefined,
      false,
      512297,
    ])
    expect(rows[5].values).toEqual([
      'influxdb-client-java',
      1345,
      undefined,
      false,
      461743,
    ])
    expect(rows[6].values).toEqual([
      'influxdb-client-java',
      1346,
      undefined,
      false,
      483059,
    ])
    expect(rows[7].values).toEqual([
      'influxdb-client-java',
      1348,
      undefined,
      false,
      607334,
    ])
    expect(rows[8].values).toEqual([
      'influxdb-client-java',
      1347,
      undefined,
      false,
      674736,
    ])
    expect(rows[9].values).toEqual([
      'influxdb-client-js',
      278,
      16321466,
      false,
      39448,
    ])
    expect(rows[10].values).toEqual([
      'influxdb-client-js',
      277,
      16321466,
      true,
      45805,
    ])
    expect(rows[11].values).toEqual([
      'influxdb-client-js',
      280,
      16321466,
      false,
      56233,
    ])
    expect(rows[12].values).toEqual([
      'influxdb-client-js',
      279,
      16321466,
      false,
      68051,
    ])
    expect(rows[13].values).toEqual([
      'influxdb-client-php',
      547,
      undefined,
      false,
      105698,
    ])
    expect(rows[14].values).toEqual([
      'influxdb-client-php',
      548,
      undefined,
      false,
      178583,
    ])
    expect(rows[15].values).toEqual([
      'influxdb-client-php',
      549,
      undefined,
      false,
      66060,
    ])
    expect(rows[16].values).toEqual([
      'influxdb-client-python',
      750,
      undefined,
      false,
      165210,
    ])
    expect(rows[17].values).toEqual([
      'influxdb-client-python',
      751,
      undefined,
      false,
      123904,
    ])
    expect(rows[18].values).toEqual([
      'influxdb-client-python',
      752,
      undefined,
      false,
      126864,
    ])
  })

  test('not exists in table columns', () => {
    let rows = client.getData(
      configParams,
      {sampleExtraction: false},
      {startDate: '2020-04-20', endDate: '2020-05-20'},
      [
        {name: 'reponame', dataType: 'STRING'},
        {name: 'build_num', dataType: 'NUMBER'},
        {name: 'user_id', dataType: 'NUMBER'},
        {name: 'failed', dataType: 'BOOLEAN'},
        {name: 'build_time_millis', dataType: 'NUMBER'},
        {name: 'not_exists_name', dataType: 'NUMBER'},
      ]
    )

    expect(UrlFetchApp.fetch.mock.calls.length).toBe(1)
    expect(UrlFetchApp.fetch.mock.calls[0][0]).toBe(
      'http://localhost:8086/api/v2/query?org=my-org'
    )
    expect(UrlFetchApp.fetch.mock.calls[0][1]).toStrictEqual({
      contentType: 'application/json',
      headers: {
        Accept: 'application/csv',
        Authorization: 'Token my-token',
        'User-Agent': 'influxdb-gds-connector',
      },
      method: 'post',
      payload: `{"query":"from(bucket: \\"my-bucket\\") |> range(start: 2020-04-20T00:00:00Z, stop: 2020-05-20T23:59:59Z) |> filter(fn: (r) => r[\\"_measurement\\"] == \\"circleci\\") |> pivot(rowKey:[\\"_time\\"], columnKey: [\\"_field\\"], valueColumn: \\"_value\\")  ", "type":"flux", "dialect":{"header":true,"delimiter":",","annotations":["datatype","group","default"],"commentPrefix":"#","dateTimeFormat":"RFC3339"}}`,
    })

    expect(rows).toHaveLength(19)
    rows.forEach(row => expect(row.values).toHaveLength(6))
    expect(rows[0].values).toEqual([
      'influxdb-client-csharp',
      789,
      undefined,
      false,
      179493,
      undefined,
    ])
  })

  test('parse_timestamp', () => {
    let rows = client.getData(
      configParams,
      {sampleExtraction: false},
      {startDate: '2020-04-20', endDate: '2020-05-20'},
      [
        {
          name: '_time',
          dataType: 'STRING',
          semantics: {
            semanticGroup: require_import.TIMESTAMP_SEMANTICS_GROUP,
          },
        },
        {
          name: '_start',
          dataType: 'STRING',
          semantics: {
            semanticGroup: require_import.TIMESTAMP_SEMANTICS_GROUP,
          },
        },
        {
          name: '_stop',
          dataType: 'STRING',
          semantics: {
            semanticGroup: require_import.TIMESTAMP_SEMANTICS_GROUP,
          },
        },
      ]
    )

    expect(UrlFetchApp.fetch.mock.calls.length).toBe(1)
    expect(UrlFetchApp.fetch.mock.calls[0][0]).toBe(
      'http://localhost:8086/api/v2/query?org=my-org'
    )
    expect(UrlFetchApp.fetch.mock.calls[0][1]).toStrictEqual({
      contentType: 'application/json',
      headers: {
        Accept: 'application/csv',
        Authorization: 'Token my-token',
        'User-Agent': 'influxdb-gds-connector',
      },
      method: 'post',
      payload: `{"query":"from(bucket: \\"my-bucket\\") |> range(start: 2020-04-20T00:00:00Z, stop: 2020-05-20T23:59:59Z) |> filter(fn: (r) => r[\\"_measurement\\"] == \\"circleci\\") |> pivot(rowKey:[\\"_time\\"], columnKey: [\\"_field\\"], valueColumn: \\"_value\\")  ", "type":"flux", "dialect":{"header":true,"delimiter":",","annotations":["datatype","group","default"],"commentPrefix":"#","dateTimeFormat":"RFC3339"}}`,
    })

    expect(rows).toHaveLength(19)
    rows.forEach(row => expect(row.values).toHaveLength(3))
    expect(rows[0].values).toEqual([
      '20200530000505',
      '20200529082924',
      '20200605082924',
    ])
  })

  test('sampleExtraction', () => {
    client.getData(
      configParams,
      {sampleExtraction: true},
      {startDate: '2020-04-20', endDate: '2020-05-20'},
      fields
    )

    expect(UrlFetchApp.fetch.mock.calls.length).toBe(1)
    expect(UrlFetchApp.fetch.mock.calls[0][0]).toBe(
      'http://localhost:8086/api/v2/query?org=my-org'
    )
    expect(UrlFetchApp.fetch.mock.calls[0][1]).toStrictEqual({
      contentType: 'application/json',
      headers: {
        Accept: 'application/csv',
        Authorization: 'Token my-token',
        'User-Agent': 'influxdb-gds-connector',
      },
      method: 'post',
      payload: `{"query":"from(bucket: \\"my-bucket\\") |> range(start: 2020-04-20T00:00:00Z, stop: 2020-05-20T23:59:59Z) |> filter(fn: (r) => r[\\"_measurement\\"] == \\"circleci\\") |> pivot(rowKey:[\\"_time\\"], columnKey: [\\"_field\\"], valueColumn: \\"_value\\") |> limit(n:10) ", "type":"flux", "dialect":{"header":true,"delimiter":",","annotations":["datatype","group","default"],"commentPrefix":"#","dateTimeFormat":"RFC3339"}}`,
    })
  })

  test('without data range', () => {
    client.getData(configParams, {sampleExtraction: false}, {}, fields)

    expect(UrlFetchApp.fetch.mock.calls.length).toBe(1)
    expect(UrlFetchApp.fetch.mock.calls[0][0]).toBe(
      'http://localhost:8086/api/v2/query?org=my-org'
    )
    expect(UrlFetchApp.fetch.mock.calls[0][1]).toStrictEqual({
      contentType: 'application/json',
      headers: {
        Accept: 'application/csv',
        Authorization: 'Token my-token',
        'User-Agent': 'influxdb-gds-connector',
      },
      method: 'post',
      payload: `{"query":"from(bucket: \\"my-bucket\\") |> range(start: time(v: 1), stop: now()) |> filter(fn: (r) => r[\\"_measurement\\"] == \\"circleci\\") |> pivot(rowKey:[\\"_time\\"], columnKey: [\\"_field\\"], valueColumn: \\"_value\\")  ", "type":"flux", "dialect":{"header":true,"delimiter":",","annotations":["datatype","group","default"],"commentPrefix":"#","dateTimeFormat":"RFC3339"}}`,
    })
  })

  test('empty result', () => {
    let httpResponse = jest.fn()
    httpResponse.getContentText = jest.fn()
    httpResponse.getContentText.mockReturnValue('')

    UrlFetchApp.fetch.mockReturnValue(httpResponse)

    let rows = client.getData(
      configParams,
      {sampleExtraction: false},
      {startDate: '2020-04-20', endDate: '2020-05-20'},
      fields
    )

    expect(rows).toHaveLength(0)
  })

  test('Aggregation - NONE', () => {
    configParams.INFLUXDB_AGGREGATION = 'NONE'

    client.getData(
      configParams,
      {sampleExtraction: false},
      {startDate: '2020-04-20', endDate: '2020-05-20'},
      fields
    )

    expect(UrlFetchApp.fetch.mock.calls.length).toBe(1)
    expect(UrlFetchApp.fetch.mock.calls[0][0]).toBe(
      'http://localhost:8086/api/v2/query?org=my-org'
    )
    expect(UrlFetchApp.fetch.mock.calls[0][1]).toStrictEqual({
      contentType: 'application/json',
      headers: {
        Accept: 'application/csv',
        Authorization: 'Token my-token',
        'User-Agent': 'influxdb-gds-connector',
      },
      method: 'post',
      payload: `{"query":"from(bucket: \\"my-bucket\\") |> range(start: 2020-04-20T00:00:00Z, stop: 2020-05-20T23:59:59Z) |> filter(fn: (r) => r[\\"_measurement\\"] == \\"circleci\\") |> pivot(rowKey:[\\"_time\\"], columnKey: [\\"_field\\"], valueColumn: \\"_value\\")  ", "type":"flux", "dialect":{"header":true,"delimiter":",","annotations":["datatype","group","default"],"commentPrefix":"#","dateTimeFormat":"RFC3339"}}`,
    })
  })

  test('Aggregation - LAST', () => {
    configParams.INFLUXDB_AGGREGATION = 'LAST'

    client.getData(
      configParams,
      {sampleExtraction: false},
      {startDate: '2020-04-20', endDate: '2020-05-20'},
      fields
    )

    expect(UrlFetchApp.fetch.mock.calls.length).toBe(1)
    expect(UrlFetchApp.fetch.mock.calls[0][0]).toBe(
      'http://localhost:8086/api/v2/query?org=my-org'
    )
    expect(UrlFetchApp.fetch.mock.calls[0][1]).toStrictEqual({
      contentType: 'application/json',
      headers: {
        Accept: 'application/csv',
        Authorization: 'Token my-token',
        'User-Agent': 'influxdb-gds-connector',
      },
      method: 'post',
      payload: `{"query":"from(bucket: \\"my-bucket\\") |> range(start: 2020-04-20T00:00:00Z, stop: 2020-05-20T23:59:59Z) |> filter(fn: (r) => r[\\"_measurement\\"] == \\"circleci\\") |> pivot(rowKey:[\\"_time\\"], columnKey: [\\"_field\\"], valueColumn: \\"_value\\") |> sort(columns: [\\"_time\\"], desc: true) |> limit(n:1) ", "type":"flux", "dialect":{"header":true,"delimiter":",","annotations":["datatype","group","default"],"commentPrefix":"#","dateTimeFormat":"RFC3339"}}`,
    })
  })

  test('Aggregation - LAST with sampleExtraction', () => {
    configParams.INFLUXDB_AGGREGATION = 'LAST'

    client.getData(
      configParams,
      {sampleExtraction: true},
      {startDate: '2020-04-20', endDate: '2020-05-20'},
      fields
    )

    expect(UrlFetchApp.fetch.mock.calls.length).toBe(1)
    expect(UrlFetchApp.fetch.mock.calls[0][0]).toBe(
      'http://localhost:8086/api/v2/query?org=my-org'
    )
    expect(UrlFetchApp.fetch.mock.calls[0][1]).toStrictEqual({
      contentType: 'application/json',
      headers: {
        Accept: 'application/csv',
        Authorization: 'Token my-token',
        'User-Agent': 'influxdb-gds-connector',
      },
      method: 'post',
      payload: `{"query":"from(bucket: \\"my-bucket\\") |> range(start: 2020-04-20T00:00:00Z, stop: 2020-05-20T23:59:59Z) |> filter(fn: (r) => r[\\"_measurement\\"] == \\"circleci\\") |> pivot(rowKey:[\\"_time\\"], columnKey: [\\"_field\\"], valueColumn: \\"_value\\") |> limit(n:10) ", "type":"flux", "dialect":{"header":true,"delimiter":",","annotations":["datatype","group","default"],"commentPrefix":"#","dateTimeFormat":"RFC3339"}}`,
    })
  })

  test('spaces in fields names', () => {
    const response = `#group,false,false,false,false,false,false,false,false,false,false,false
#datatype,string,long,long,double,long,double,long,double,string,string,string
#default,_result,,,,,,,,,,
,result,table,7-day smoothed daily change,7-day smoothed daily change per thousand,Cumulative total,Cumulative total per thousand,Daily change in cumulative total,Daily change in cumulative total per thousand,Notes,Source URL,Source label
,,0,52349,0.158,14022,1.156,9314,0.064,"Turkish Minister for Health said 7286 tests were conducted on 25th March, so we can subtract that from 26th March figure. This is consistent with Wikipedia",https://covid-19-schweiz.bagapps.ch/de-3.html,COVID Tracking Project

`
    let httpResponse = jest.fn()
    httpResponse.getContentText = jest.fn()
    httpResponse.getContentText.mockReturnValue(response)

    UrlFetchApp.fetch.mockReturnValue(httpResponse)

    let rows = client.getData(
      configParams,
      {sampleExtraction: false},
      {startDate: '2020-04-20', endDate: '2020-05-20'},
      [
        {
          name: '7__minus__day__space__smoothed__space__daily__space__change',
          dataType: 'NUMBER',
        },
        {
          name: 'Cumulative__space__total__space__per__space__thousand',
          dataType: 'NUMBER',
        },
      ]
    )

    expect(UrlFetchApp.fetch.mock.calls.length).toBe(1)
    expect(UrlFetchApp.fetch.mock.calls[0][0]).toBe(
      'http://localhost:8086/api/v2/query?org=my-org'
    )
    expect(UrlFetchApp.fetch.mock.calls[0][1]).toStrictEqual({
      contentType: 'application/json',
      headers: {
        Accept: 'application/csv',
        Authorization: 'Token my-token',
        'User-Agent': 'influxdb-gds-connector',
      },
      method: 'post',
      payload: `{"query":"from(bucket: \\"my-bucket\\") |> range(start: 2020-04-20T00:00:00Z, stop: 2020-05-20T23:59:59Z) |> filter(fn: (r) => r[\\"_measurement\\"] == \\"circleci\\") |> pivot(rowKey:[\\"_time\\"], columnKey: [\\"_field\\"], valueColumn: \\"_value\\")  ", "type":"flux", "dialect":{"header":true,"delimiter":",","annotations":["datatype","group","default"],"commentPrefix":"#","dateTimeFormat":"RFC3339"}}`,
    })

    expect(rows).toHaveLength(1)
    rows.forEach(row => expect(row.values).toHaveLength(2))
    expect(rows[0].values).toEqual([52349, 1.156])
  })
})

describe('build URL', () => {
  test('value', () => {
    let configParams = {}
    configParams.INFLUXDB_URL = 'http://localhost:8086'
    configParams.INFLUXDB_ORG = 'my-org'

    let url = client._buildURL(configParams)
    expect(url).toEqual('http://localhost:8086/api/v2/query?org=my-org')
  })

  test('slash at the end', () => {
    let configParams = {}
    configParams.INFLUXDB_URL = 'http://localhost:8086/'
    configParams.INFLUXDB_ORG = 'my-org'

    let url = client._buildURL(configParams)
    expect(url).toEqual('http://localhost:8086/api/v2/query?org=my-org')
  })

  test('escaped org', () => {
    let configParams = {}
    configParams.INFLUXDB_URL = 'http://localhost:8086'
    configParams.INFLUXDB_ORG = 'my org'

    let url = client._buildURL(configParams)
    expect(url).toEqual('http://localhost:8086/api/v2/query?org=my%20org')
  })
})
