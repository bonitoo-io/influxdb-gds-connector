const InfluxDBClient = require("../src/InfluxDBClient");

let client;

beforeEach(() => {
  client = new InfluxDBClient();
  UrlFetchApp = jest.fn();
  UrlFetchApp.fetch = jest.fn();

  let httpResponse = jest.fn();
  httpResponse.getContentText = jest.fn();

  UrlFetchApp.fetch.mockReturnValue(httpResponse);

  Utilities = jest.fn();
  Utilities.parseCsv = jest.fn();
});

describe("get buckets", () => {
  test("success", () => {
    // noinspection JSConsecutiveCommasInArrayLiteral
    const csv = [
      [, "result", "table", "_value"],
      [, "_result", 0, "HEALTH"],
      [, "_result", 0, "_monitoring"],
      [, "_result", 0, "_tasks"],
      [, "_result", 0, "github"],
      [, , ,]
    ];

    Utilities.parseCsv.mockReturnValue(csv);

    let configParams = {};
    configParams.INFLUXDB_URL = "http://localhost:9999";
    configParams.INFLUXDB_TOKEN = "my-token";
    configParams.INFLUXDB_ORG = "my-org";

    let buckets = client.getBuckets(configParams);
    expect(UrlFetchApp.fetch.mock.calls.length).toBe(1);
    expect(UrlFetchApp.fetch.mock.calls[0][0]).toBe(
      "http://localhost:9999/api/v2/query?org=my-org"
    );
    expect(UrlFetchApp.fetch.mock.calls[0][1]).toStrictEqual({
      contentType: "application/vnd.flux",
      headers: { Accept: "application/csv", Authorization: "Token my-token" },
      method: "post",
      payload: `buckets() |> rename(columns: {"name": "_value"}) |> keep(columns: ["_value"]) |> sort(columns: ["_value"], desc: false)`
    });

    expect(buckets).toHaveLength(4);
    expect(buckets).toEqual(["HEALTH", "_monitoring", "_tasks", "github"]);
  });
});

describe("get measurements", () => {
  test("success", () => {
    // noinspection JSConsecutiveCommasInArrayLiteral
    const csv = [
      [, "result", "table", "_value"],
      [, "_result", 0, "circleci"],
      [, "_result", 0, "github_repository"],
      [, , ,]
    ];

    Utilities.parseCsv.mockReturnValue(csv);

    let configParams = {};
    configParams.INFLUXDB_URL = "http://localhost:9999";
    configParams.INFLUXDB_TOKEN = "my-token";
    configParams.INFLUXDB_ORG = "my-org";
    configParams.INFLUXDB_BUCKET = "my-bucket";

    let buckets = client.getMeasurements(configParams);
    expect(UrlFetchApp.fetch.mock.calls.length).toBe(1);
    expect(UrlFetchApp.fetch.mock.calls[0][0]).toBe(
      "http://localhost:9999/api/v2/query?org=my-org"
    );
    expect(UrlFetchApp.fetch.mock.calls[0][1]).toStrictEqual({
      contentType: "application/vnd.flux",
      headers: { Accept: "application/csv", Authorization: "Token my-token" },
      method: "post",
      payload:
        'import "influxdata/influxdb/v1" v1.measurements(bucket: "my-bucket")'
    });

    expect(buckets).toHaveLength(2);
    expect(buckets).toEqual(["circleci", "github_repository"]);
  });
});

describe("get fields", () => {
  test("success", () => {
    // noinspection JSConsecutiveCommasInArrayLiteral
    const csv = [
      [, "result", "table", "_value"],
      [, "_result", 0, "host"],
      [, "_result", 0, "reponame"],
      [, "_result", 0, "vcs_url"],
      [, , ,]
    ];

    // Mocks for tags
    Utilities.parseCsv.mockReturnValue(csv);

    // Mocks for fields
    const response = `#group,false,false,false,false,false,false,false
#datatype,string,long,boolean,double,long,string,unsignedLong
#default,_result,,,,,,
,result,table,fieldBool,fieldFloat,fieldInteger,fieldString,fieldUInteger
,,0,true,-1234456000000000000000000000000000000000000000000000000000000000000000000000000,12485903,this is a string,6

`;
    let httpResponse = jest.fn();
    httpResponse.getContentText = jest.fn();
    httpResponse.getContentText.mockReturnValue(response);

    UrlFetchApp.fetch.mockReturnValue(httpResponse);

    let configParams = {};
    configParams.INFLUXDB_URL = "http://localhost:9999";
    configParams.INFLUXDB_TOKEN = "my-token";
    configParams.INFLUXDB_ORG = "my-org";
    configParams.INFLUXDB_BUCKET = "my-bucket";
    configParams.INFLUXDB_MEASUREMENT = "circleci";

    let buckets = client.getFields(configParams);
    expect(UrlFetchApp.fetch.mock.calls.length).toBe(2);
    expect(UrlFetchApp.fetch.mock.calls[0][0]).toBe(
      "http://localhost:9999/api/v2/query?org=my-org"
    );
    expect(UrlFetchApp.fetch.mock.calls[0][1]).toStrictEqual({
      contentType: "application/vnd.flux",
      headers: {
        Accept: "application/csv",
        Authorization: "Token my-token"
      },
      method: "post",
      payload: `import "influxdata/influxdb/v1"

v1.tagKeys(
  bucket: "my-bucket",
  predicate: (r) => r._measurement == "circleci",
  start: duration(v: uint(v: 1970-01-01) - uint(v: now()))
)
|> filter(fn: (r) => r._value != "_start" and r._value != "_stop" and r._value != "_measurement" and r._value != "_field")`
    });
    expect(UrlFetchApp.fetch.mock.calls[1][0]).toBe(
      "http://localhost:9999/api/v2/query?org=my-org"
    );
    expect(UrlFetchApp.fetch.mock.calls[1][1]).toStrictEqual({
      contentType: "application/vnd.flux",
      headers: {
        Accept: "application/csv",
        Authorization: "Token my-token"
      },
      method: "post",
      payload: `from(bucket: "my-bucket")
  |> range(start: time(v: 1))
  |> filter(fn: (r) => r["_measurement"] == "circleci")
  |> drop(columns: ["host", "reponame", "vcs_url"])
  |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> drop(columns: ["_start", "_stop", "_time", "_measurement"])
  |> limit(n:1)`
    });

    expect(buckets).toHaveLength(8);
    expect(buckets[0]).toEqual({
      dataType: "STRING",
      label: "host",
      name: "host",
      semantics: {
        conceptType: "DIMENSION"
      }
    });
    expect(buckets[1]).toEqual({
      dataType: "STRING",
      label: "reponame",
      name: "reponame",
      semantics: {
        conceptType: "DIMENSION"
      }
    });
    expect(buckets[2]).toEqual({
      dataType: "STRING",
      label: "vcs_url",
      name: "vcs_url",
      semantics: {
        conceptType: "DIMENSION"
      }
    });
    expect(buckets[3]).toEqual({});
    expect(buckets[4]).toEqual({});
    expect(buckets[5]).toEqual({});
    expect(buckets[6]).toEqual({});
    expect(buckets[7]).toEqual({});
  });
});

describe("build URL", () => {
  test("value", () => {
    let configParams = {};
    configParams.INFLUXDB_URL = "http://localhost:9999";
    configParams.INFLUXDB_ORG = "my-org";

    let url = client._buildURL(configParams);
    expect(url).toEqual("http://localhost:9999/api/v2/query?org=my-org");
  });

  test("slash at the end", () => {
    let configParams = {};
    configParams.INFLUXDB_URL = "http://localhost:9999/";
    configParams.INFLUXDB_ORG = "my-org";

    let url = client._buildURL(configParams);
    expect(url).toEqual("http://localhost:9999/api/v2/query?org=my-org");
  });

  test("escaped org", () => {
    let configParams = {};
    configParams.INFLUXDB_URL = "http://localhost:9999";
    configParams.INFLUXDB_ORG = "my org";

    let url = client._buildURL(configParams);
    expect(url).toEqual("http://localhost:9999/api/v2/query?org=my%20org");
  });
});
