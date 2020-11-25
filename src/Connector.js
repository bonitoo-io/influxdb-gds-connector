const cc = DataStudioApp.createCommunityConnector()

/**
 * Returns the Auth Type of this connector.
 * @return {object} The Auth type.
 */
function getAuthType() {
  return {type: 'NONE'}
}

/**
 * This checks whether the current user is an admin user of the connector.
 *
 * @returns {boolean} Returns true if the current authenticated user at the time
 * of function execution is an admin user of the connector. If the function is
 * omitted or if it returns false, then the current user will not be considered
 * an admin user of the connector.
 */
function isAdminUser() {
  return false
}

/**
 * Get Schema fields for given configuration.
 *
 * @param request
 * @param cached {boolean}  use cached values
 * @param client {InfluxDBClient}  InfluxDB cliebt
 * @returns fields for given configuration
 */
function getFields(request, cached, client) {
  validateConfig(request.configParams)

  const cacheKey = [
    request.configParams.INFLUXDB_URL,
    request.configParams.INFLUXDB_BUCKET,
    request.configParams.INFLUXDB_MEASUREMENT,
  ].join('#')

  if (cached) {
    const cachedSchema = getCachedSchema(cacheKey)
    if (cachedSchema !== null) {
      Logger.log(
        'Use cached schema for key: %s, schema: %s',
        cacheKey,
        cachedSchema
      )
      return cachedSchema
    }
  }

  try {
    let fields = client.getFields(request.configParams)

    putCachedSchema(cacheKey, fields)

    return fields
  } catch (e) {
    throwUserError(
      `"GetFields from: ${request.configParams.INFLUXDB_URL}" returned an error:${e}`,
      e
    )
  }
}

// https://developers.google.com/datastudio/connector/reference#getconfig
function getConfig(request) {
  const client = new InfluxDBClient()
  const configParams = request.configParams
  const config = cc.getConfig()

  config
    .newTextInput()
    .setId('INFLUXDB_URL')
    .setName('InfluxDB URL')
    .setHelpText('e.g. https://us-west-2-1.aws.cloud2.influxdata.com')

  config
    .newInfo()
    .setId('instructions-token')
    .setText(
      'How to retrieve the Token - https://v2.docs.influxdata.com/v2.0/security/tokens/view-tokens/.'
    )

  config
    .newTextInput()
    .setId('INFLUXDB_TOKEN')
    .setName('Token')
    .setHelpText(
      'e.g. 2gihWWvM3_r1Q58GwSsF03iR9wsnjS4X6qNP9SLKj5eURe5-_eR0HMia-gU1gSAJ8SiCIzymRLgU1pmTV-0dDA=='
    )

  config
    .newInfo()
    .setId('instructions-org')
    .setText(
      'How to retrieve the Organization - https://v2.docs.influxdata.com/v2.0/organizations/view-orgs/.'
    )

  config
    .newTextInput()
    .setId('INFLUXDB_ORG')
    .setName('Organization')
    .setHelpText('e.g. my-org')

  let isConfigEmpty = configParams === undefined

  if (
    !isConfigEmpty &&
    configParams.INFLUXDB_URL &&
    configParams.INFLUXDB_TOKEN
  ) {
    let select = config
      .newSelectSingle()
      .setId('INFLUXDB_BUCKET')
      .setName('Bucket')
      .setIsDynamic(true)

    try {
      let buckets = client.getBuckets(configParams).sort()
      buckets.forEach(function (bucket) {
        select.addOption(
          config.newOptionBuilder().setLabel(bucket).setValue(bucket)
        )
      })
    } catch (e) {
      throwUserError(
        `"GetBuckets from: ${configParams.INFLUXDB_URL}" returned an error:${e}`,
        e
      )
    }
  }

  if (
    !isConfigEmpty &&
    configParams.INFLUXDB_URL &&
    configParams.INFLUXDB_TOKEN &&
    configParams.INFLUXDB_BUCKET
  ) {
    let select = config
      .newSelectSingle()
      .setId('INFLUXDB_MEASUREMENT')
      .setName('Measurement')
      .setIsDynamic(true)

    try {
      let buckets = client.getMeasurements(configParams).sort()
      buckets.forEach(function (measurement) {
        select.addOption(
          config.newOptionBuilder().setLabel(measurement).setValue(measurement)
        )
      })
    } catch (e) {
      throwUserError(
        `"GetMeasurements from: ${configParams.INFLUXDB_URL}" returned an error:${e}`,
        e
      )
    }
  }

  let isBucketEmpty =
    isConfigEmpty ||
    configParams.INFLUXDB_BUCKET === undefined ||
    configParams.INFLUXDB_BUCKET === null

  let isMeasurementEmpty =
    isConfigEmpty ||
    configParams.INFLUXDB_MEASUREMENT === undefined ||
    configParams.INFLUXDB_MEASUREMENT === null

  if (isBucketEmpty || isMeasurementEmpty) {
    config.setIsSteppedConfig(true)
  }
  // else {
  //   config
  //     .newSelectSingle()
  //     .setId('INFLUXDB_AGGREGATION')
  //     .setName('Aggregation')
  //     .setHelpText(
  //       'Select the type of query results aggregation. The "Last" option select only last row from each Time Series.'
  //     )
  //     .setAllowOverride(false)
  //     .addOption(config.newOptionBuilder().setLabel('None').setValue('NONE'))
  //     .addOption(config.newOptionBuilder().setLabel('Last').setValue('LAST'))
  // }

  config.setDateRangeRequired(true)

  return config.build()
}

function getSchema(request) {
  let client = new InfluxDBClient()
  const fields = getFields(request, false, client)
  return {schema: fields}
}

function getData(request) {
  const start = new Date()
  const client = new InfluxDBClient()
  const names = request.fields.map(field => field.name)

  let fieldsFiltered = getFields(request, true, client).filter(field =>
    names.includes(field.name)
  )

  Logger.log('Use fields: %s for requested names: %s', fieldsFiltered, names)

  try {
    let rows = client.getData(
      request.configParams,
      request.scriptParams,
      request.dateRange,
      fieldsFiltered
    )

    Logger.log('GetData took: "%s" milliseconds.', new Date() - start)

    return {
      schema: fieldsFiltered,
      rows: rows,
      filtersApplied: false,
    }
  } catch (e) {
    throwUserError(
      `"GetData from: ${request.configParams.INFLUXDB_URL}" for fields: ${fieldsFiltered} returned an error:${e}`,
      e
    )
  }
}

/**
 * Validate config object and throw error if anything wrong.
 *
 * @param  {Object} configParams Config object supplied by user.
 */
function validateConfig(configParams) {
  const client = new InfluxDBClient()
  let errors = client.validateConfig(configParams)
  if (errors) {
    throwUserError(errors, '')
  }
}

/**
 * Throws User-facing errors.
 *
 * @param  {string} message Error message.
 * @param {string} error original Error
 */
function throwUserError(message, error) {
  console.error('The connector yielded an error: ' + error)
  DataStudioApp.createCommunityConnector()
    .newUserError()
    .setText(message)
    .setDebugText(error)
    .throwException()
}

function getCachedSchema(key) {
  const cache = CacheService.getScriptCache()

  let cached = cache.get(hashKey(key))
  if (cached) {
    let bytes = Utilities.base64Decode(cached)
    let blob_gzip = Utilities.newBlob(bytes, 'application/x-gzip')
    let data_as_string = Utilities.ungzip(blob_gzip).getDataAsString()
    return JSON.parse(data_as_string)
  }

  return null
}

function putCachedSchema(key, fields) {
  const cache = CacheService.getScriptCache()

  try {
    const cacheValue = JSON.stringify(fields)
    let blob_zipped = Utilities.gzip(Utilities.newBlob(cacheValue))
    let encoded_bytes = Utilities.base64Encode(blob_zipped.getBytes())

    let keyHash = hashKey(key)
    Logger.log(
      'Store cached schema for key: %s, schema: %s',
      keyHash,
      cacheValue
    )
    cache.put(keyHash, encoded_bytes)
  } catch (e) {
    console.log(e)
  }
}

function hashKey(key) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.MD5,
    key + ''
  )
  return Utilities.base64Encode(digest)
}

// Needed for testing
var module = module || {}
module.exports = {getAuthType, isAdminUser, getData}
