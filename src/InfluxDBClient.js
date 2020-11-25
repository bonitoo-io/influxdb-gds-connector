function InfluxDBClient() {}

const QUERY_BUCKETS = () =>
  'buckets() |> rename(columns: {"name": "_value"}) |> keep(columns: ["_value"]) |> sort(columns: ["_value"], desc: false)'

const QUERY_MEASUREMENTS = bucket_name =>
  `import "influxdata/influxdb/v1"

v1.tagValues(
  bucket: "${bucket_name}",
  tag: "_measurement",
  predicate: (r) => true,
  start: duration(v: uint(v: 1970-01-01) - uint(v: now()))
)`

const QUERY_SCHEMA = (bucket_name, measurement_name) => {
  let query =
    `import \\"influxdata/influxdb/v1\\" ` +
    `bucket = \\"${bucket_name}\\" ` +
    `measurement = \\"${measurement_name}\\" ` +
    `start_range = duration(v: uint(v: 1970-01-01) - uint(v: now())) ` +
    `v1.tagKeys( ` +
    `bucket: bucket, ` +
    `predicate: (r) => r._measurement == measurement, ` +
    `start: start_range ` +
    `) |> filter(fn: (r) => r._value != \\"_start\\" and r._value != \\"_stop\\" and r._value != \\"_measurement\\" and r._value != \\"_field\\") ` +
    `|> yield(name: \\"tags\\") ` +
    `from(bucket: bucket) ` +
    `|> range(start: start_range) ` +
    `|> filter(fn: (r) => r[\\"_measurement\\"] == measurement) ` +
    `|> keep(fn: (column) => column == \\"_field\\" or column == \\"_value\\") ` +
    `|> unique(column: \\"_field\\") ` +
    `|> yield(name: \\"fields\\")`

  return (
    `{"query":"${query}", ` +
    `"type":"flux", ` +
    `"dialect":{"header":true,"delimiter":",","annotations":["datatype","group","default"],"commentPrefix":"#","dateTimeFormat":"RFC3339"}}`
  )
}

const QUERY_DATA = (
  bucket_name,
  measurement_name,
  aggregation,
  range_start,
  range_stop,
  sampleExtraction,
  fields
) => {
  if (range_start) {
    range_start += 'T00:00:00Z'
  } else {
    range_start = 'time(v: 1)'
  }
  if (range_stop) {
    range_stop += 'T23:59:59Z'
  } else {
    range_stop = 'now()'
  }
  let limit_size
  if (sampleExtraction) {
    limit_size = '|> limit(n:10)'
  } else if (aggregation && aggregation === 'LAST') {
    limit_size = '|> sort(columns: [\\"_time\\"], desc: true) |> limit(n:1)'
  } else {
    limit_size = ''
  }
  let keeps = fields
    .map(function (field) {
      return `\\"${_toOriginalFieldName(field.name)}\\"`
    })
    .join(', ')
  return (
    `{"query":"from(bucket: \\"${bucket_name}\\") ` +
    `|> range(start: ${range_start}, stop: ${range_stop}) ` +
    `|> filter(fn: (r) => r[\\"_measurement\\"] == \\"${measurement_name}\\") ` +
    `|> pivot(rowKey:[\\"_time\\"], columnKey: [\\"_field\\"], valueColumn: \\"_value\\") ` +
    `${limit_size} ` +
    `", ` +
    `"type":"flux", ` +
    `"dialect":{"header":true,"delimiter":",","annotations":["datatype","group","default"],"commentPrefix":"#","dateTimeFormat":"RFC3339"}}`
  )
}

const TIMESTAMP_SEMANTICS_GROUP = 'DATETIME'
const TIMESTAMP_SEMANTICS_TYPE = 'YEAR_MONTH_DAY_SECOND'

/**
 * Validate configuration of Connector.
 *
 * @param configParams configuration
 * @returns {string} configuration errors
 */
InfluxDBClient.prototype.validateConfig = function (configParams) {
  let errors = []
  configParams = configParams || {}
  if (!configParams.INFLUXDB_URL) {
    errors.push('URL to connect should be defined.')
  }
  if (!configParams.INFLUXDB_TOKEN) {
    errors.push('Token should be defined.')
  }
  if (!configParams.INFLUXDB_ORG) {
    errors.push('Organization should be defined.')
  }
  if (!configParams.INFLUXDB_BUCKET) {
    errors.push('Bucket should be defined.')
  }
  if (!configParams.INFLUXDB_MEASUREMENT) {
    errors.push('Measurement should be defined.')
  }
  return errors.join(' ')
}

/**
 * Get Buckets names for configured URL, Org and Token.
 *
 * @param configParams configuration
 * @returns {[string]} buckets names
 */
InfluxDBClient.prototype.getBuckets = function (configParams) {
  return this._query(configParams, QUERY_BUCKETS())
}

/**
 * Get Measurements names for configured URL, Org, Token and Bucket.
 *
 * @param configParams configuration
 * @returns {[]} measurements names
 */
InfluxDBClient.prototype.getMeasurements = function (configParams) {
  let query = QUERY_MEASUREMENTS(configParams.INFLUXDB_BUCKET)
  return this._query(configParams, query)
}

/**
 * Get Fields names for configured URL, Org, Token, Bucket and Measurement.
 *
 * @param configParams configuration
 * @returns fields definition
 */
InfluxDBClient.prototype.getFields = function (configParams) {
  const result = []
  const tags = []
  const fields = []

  const measurement = {}
  measurement.name = '_measurement'
  measurement.label = 'measurement'
  measurement.dataType = 'STRING'
  measurement.semantics = {}
  measurement.semantics.conceptType = 'DIMENSION'
  result.push(measurement)

  let querySchema = QUERY_SCHEMA(
    configParams.INFLUXDB_BUCKET,
    configParams.INFLUXDB_MEASUREMENT
  )

  let tables = this._query(configParams, querySchema, {
    mapping: this._extractData,
    contentType: 'application/json',
  })

  tables.forEach(table => {
    let type = table.defaults[1]
    let csv = Utilities.parseCsv(table.rows.join('\n'), ',')
    let value_index = table.names.indexOf('_value')
    switch (type) {
      case 'fields':
        let field_index = table.names.indexOf('_field')
        csv.forEach(row => {
          let name = row[field_index]
          let dataType = table.data_types[value_index]
          let field = parseFieldSchema(name, dataType)
          fields.push(field)
        })
        break
      case 'tags':
        csv.forEach(row => {
          let tag = row[value_index].trim()
          const field = {}
          field.name = _sanitizeFieldName(tag)
          field.label = tag
          field.dataType = 'STRING'
          field.semantics = {}
          field.semantics.conceptType = 'DIMENSION'
          tags.push(field)
        })
        break
    }
  })

  result.push(...tags)
  result.push(...fields)

  const timestamp = {}
  timestamp.name = '_time'
  timestamp.label = 'time'
  timestamp.dataType = 'STRING'
  timestamp.semantics = {}
  timestamp.semantics.isReaggregatable = false
  timestamp.semantics.conceptType = 'DIMENSION'
  timestamp.semantics.semanticType = TIMESTAMP_SEMANTICS_TYPE
  timestamp.semantics.semanticGroup = TIMESTAMP_SEMANTICS_GROUP
  result.push(timestamp)

  return result
}

/**
 * Returns the tabular data for the given request.
 * @param configParams An object containing the user provided values for the config parameters defined by the connector.
 * @param scriptParams An object containing information relevant to connector execution
 * @param dateRange By default, the date range provided will be the last 28 days excluding today. If a user applies a date range filter for a report, then the date range provided will reflect the user selection.
 * @param fields The names of the requested fields.
 * @returns {*[]} The values for the requested field(s).
 */
InfluxDBClient.prototype.getData = function (
  configParams,
  scriptParams,
  dateRange,
  fields
) {
  let queryData = QUERY_DATA(
    configParams.INFLUXDB_BUCKET,
    configParams.INFLUXDB_MEASUREMENT,
    configParams.INFLUXDB_AGGREGATION,
    dateRange.startDate,
    dateRange.endDate,
    scriptParams.sampleExtraction || false,
    fields
  )

  Logger.log('Request to InfluxDB: %s', queryData)

  let tables = this._query(configParams, queryData, {
    mapping: this._extractData,
    contentType: 'application/json',
  })

  let rows = tables
    .map(table => {
      let csv = Utilities.parseCsv(table.rows.join('\n'), ',')
      return csv.map(row => ({
        values: fields.map(field => {
          let index = table.names.indexOf(_toOriginalFieldName(field.name))
          let value = row[index]
          if (value === undefined) {
            return undefined
          }
          switch (field.dataType) {
            case 'NUMBER':
              return parseFloat(value)
            case 'BOOLEAN':
              return 'true' === value.toLowerCase()
            default:
              if (
                field.semantics &&
                field.semantics.semanticGroup === TIMESTAMP_SEMANTICS_GROUP
              ) {
                let date = new Date(value)
                return (
                  date.getUTCFullYear() +
                  ('0' + (date.getUTCMonth() + 1)).slice(-2) +
                  ('0' + date.getUTCDate()).slice(-2) +
                  ('0' + date.getUTCHours()).slice(-2) +
                  ('0' + date.getUTCMinutes()).slice(-2) +
                  ('0' + date.getUTCSeconds()).slice(-2)
                )
              }
              return value
          }
        }),
      }))
    })
    .reduce((array1, array2) => array1.concat(array2), [])

  Logger.log('Mapped response to: %s', rows)

  return rows
}

InfluxDBClient.prototype._query = function (
  configParams,
  query,
  configs = {
    mapping: this._extractSchema,
    contentType: 'application/vnd.flux',
  }
) {
  const options = {
    method: 'post',
    payload: query,
    contentType: configs.contentType,
    headers: {
      Authorization: 'Token ' + configParams.INFLUXDB_TOKEN,
      Accept: 'application/csv',
      'User-Agent': 'influxdb-gds-connector',
    },
  }
  let url = this._buildURL(configParams)
  const response = UrlFetchApp.fetch(url, options).getContentText()

  return configs.mapping(response)
}

InfluxDBClient.prototype._extractSchema = function (textContent) {
  const csv = Utilities.parseCsv(textContent, ',')

  let values = []
  let value_index
  csv.forEach(function (row) {
    if (!value_index) {
      value_index = row.indexOf('_value')
    } else {
      let bucket = row[value_index]
      if (bucket) {
        values.push(bucket)
      }
    }
  })
  return values
}

InfluxDBClient.prototype._extractData = function (textContent) {
  let processNextTable = true
  let table
  let tables = []

  function prepareTable() {
    if (processNextTable) {
      table = new InfluxDBTable()
      tables.push(table)
      processNextTable = false
    }
  }

  Logger.log('Response from InfluxDB: %s', textContent)

  textContent
    .split('\n')
    .filter(line => line.trim().length !== 0)
    .forEach(line => {
      if (line.startsWith('#group')) {
        prepareTable()
        table.group = line.split(',').map(it => it.trim())
      } else if (line.startsWith('#datatype')) {
        prepareTable()
        table.data_types = line.split(',').map(it => it.trim())
      } else if (line.startsWith('#default')) {
        prepareTable()
        table.defaults = line.split(',').map(it => it.trim())
      } else if (line.startsWith(',result,table,')) {
        prepareTable()
        table.names = line.split(',').map(it => it.trim())
      } else {
        // process row of table first time => parseSchema,
        if (!processNextTable) {
          table.parseSchema()
          processNextTable = true
        }
        table.rows.push(line)
      }
    })

  Logger.log('Parsed response to: %s', tables)

  return tables
}

InfluxDBClient.prototype._buildURL = function (configParams) {
  let url = configParams.INFLUXDB_URL
  if (!url.endsWith('/')) {
    url += '/'
  }
  url += 'api/v2/query?org='
  url += encodeURIComponent(configParams.INFLUXDB_ORG)
  return url
}

function _sanitizeFieldName(name) {
  return name.replace(/\s/g, '__space__').replace(/-/g, '__minus__')
}

function _toOriginalFieldName(name) {
  return name.replace(/__space__/g, ' ').replace(/__minus__/g, '-')
}

function parseFieldSchema(name, type) {
  const field = {}
  field.name = _sanitizeFieldName(name.trim())
  field.label = name.trim()
  field.semantics = {}
  field.semantics.conceptType = 'METRIC'
  field.semantics.isReaggregatable = false

  switch (type.trim()) {
    case 'double':
    case 'long':
    case 'unsignedLong':
      field.dataType = 'NUMBER'
      field.semantics.semanticGroup = 'NUMBER'
      field.semantics.isReaggregatable = true
      break
    case 'boolean':
      field.dataType = 'BOOLEAN'
      break
    case 'dateTime:RFC3339':
      field.dataType = 'STRING'
      field.semantics.semanticType = TIMESTAMP_SEMANTICS_TYPE
      field.semantics.semanticGroup = TIMESTAMP_SEMANTICS_GROUP
      break
    default:
      field.dataType = 'STRING'
      break
  }

  return field
}

class InfluxDBTable {
  constructor() {
    this.rows = []
    this.fields = []
  }

  parseSchema() {
    let data_types = this.data_types.slice(3)
    let names = this.names.slice(3)
    data_types.forEach((type, index) => {
      const field = parseFieldSchema(names[index], type)
      this.fields.push(field)
    })
  }
}

// istanbul ignore next
// Needed for testing
var module = module || {}
module.exports = {InfluxDBClient, TIMESTAMP_SEMANTICS_GROUP}
