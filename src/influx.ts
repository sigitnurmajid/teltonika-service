import { InfluxDB, Point } from '@influxdata/influxdb-client'
import { IInfluxConfig } from './config'

export class InfluxDriver {
  private influxClient: InfluxDB

  constructor(private config: IInfluxConfig) {
    this.influxClient = new InfluxDB({ url: config.url, token: config.token })
  }

  public async writePoints(points: Array<Point>) {
    if (points.length === 0) return
    const writeApi = this.influxClient.getWriteApi(this.config.orgId, this.config.bucket)
    writeApi.writePoints(points)
    return await writeApi.close()
  }

  public async writePoint(point: Point) {
    const writeApi = this.influxClient.getWriteApi(this.config.orgId, this.config.bucket)
    writeApi.writePoint(point)
    return await writeApi.close()
  }
}
