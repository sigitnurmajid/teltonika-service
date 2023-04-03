import * as net from 'net'
import axios from 'axios'
import crc from 'crc';
import { Point } from '@influxdata/influxdb-client'
import { BackedConfig } from './config';

export class Parser {
  constructor(
    private data: Buffer,
    private sock: net.Socket,
    private redis: any
  ) {
  }

  public points: Array<Point> = []

  async parse() {
    // check preamble
    const preamble = this.data.subarray(0, 4)
    if (preamble.compare(Buffer.from([0x00, 0x00, 0x00, 0x00])) !== 0) return this.imeiCheck()

    const dataFieldLength = this.data.subarray(4, 8).readInt32BE(0)
    const mainData = this.data.subarray(8, dataFieldLength + 8)

    // check crc
    const crcFromData = this.data.subarray(this.data.length - 4).readInt32BE(0)
    const resultCrcCalc = this.crcCalc(mainData)
    if (crcFromData !== resultCrcCalc) return this.logError('Crc not match')

    // check codecId
    const codecId = mainData.subarray(0, 1)
    if (codecId.compare(Buffer.from([0x8E])) !== 0) return this.logError('CodecID check mismatch')

    // check number start and number end
    const numberOfDataStart = mainData.subarray(1, 2)
    const numberOfDataEnd = mainData.subarray(mainData.length - 1)
    if (numberOfDataStart.compare(numberOfDataEnd) !== 0) return this.logError('Number of data start and end mismatch')

    // parse AVL Data
    const avlData = mainData.subarray(2, dataFieldLength - 1)

    let avlIndexAddress = 0
    let avlCount = 0

    while (avlCount < this.hexToNumber(numberOfDataStart)) {
      const timestampRaw = avlData.subarray(avlIndexAddress, avlIndexAddress + 8)
      const priorityRaw = avlData.subarray(avlIndexAddress, avlIndexAddress + 9)
      const gpsElementRaw = avlData.subarray(avlIndexAddress + 9, avlIndexAddress + 24)
      const ioElementRaw = avlData.subarray(avlIndexAddress + 24, avlData.length - 1)

      // calculate timestamp
      const timestamp = this.timestampCalc(timestampRaw)

      // get imei
      const imei = await this.getImei()

      // calculate gps
      const gps = this.gpsCalc(gpsElementRaw)

      if (imei === '') return this.logError('IMEI not found on redis')

      const eventIOId = ioElementRaw.subarray(0, 2)
      const nOfTotalId = ioElementRaw.subarray(2, 4).readInt16BE(0)
      let indexTotalId = 0
      let indexId = 0
      let indexAddress = 4
      let nx = 0

      while (indexTotalId < nOfTotalId) {
        let n1OfOneByteIo = ioElementRaw.subarray(indexAddress, indexAddress + 2).readInt16BE(0)
        indexAddress += 2
        let i = 0
        while (indexId < n1OfOneByteIo) {
          const ioId = ioElementRaw.subarray(indexAddress, indexAddress + i + 2)
          const ioValue = ioElementRaw.subarray(indexAddress + 2, indexAddress + 1 + (2 ** nx) + 1)
          indexAddress = indexAddress + 2 + (2 ** nx)
          indexId += 1
          indexTotalId += 1
          i += 0

          const point = new Point(imei)
            .tag('IPAddress', this.sock.remoteAddress!)
            .tag('ioID', ioId.readInt16BE(0).toString())
            .tag('event', (eventIOId.compare(ioId) === 0) ? 'true' : 'false')
            .tag('priority', priorityRaw.readInt16BE(0).toString())
            .intField('ioValue', this.hexToNumber(ioValue))
            .stringField('longitude', gps.longitude)
            .stringField('latitude', gps.latitude)
            .floatField('altitude', gps.altitude)
            .floatField('angle', gps.angle)
            .intField('satelites', gps.satelites)
            .floatField('speed', gps.speed)
            .stringField('storedTime', new Date().toISOString())
            .timestamp(timestamp)

          this.points.push(point)
        }
        nx += 1
        indexId = 0
      }
      avlIndexAddress = avlIndexAddress + indexAddress + 2 + 24

      avlCount += 1
    }
    const prefix = Buffer.from([0x00, 0x00, 0x00])
    this.sock.write(Buffer.concat([prefix, numberOfDataStart]))
    return
  }

  async getImei() {
    const imei = await this.redis.get(`imei/${this.sock.remoteAddress}`)
    if (typeof (imei) === 'string') {
      return imei
    }
    return ''
  }

  async imeiCheck(): Promise<void> {
    const imeiLength = this.data.subarray(0, 2).readInt16BE(0)

    if (imeiLength !== 15) return

    const imei = this.data.subarray(2, this.data.length).toString()

    try {
      const responseCheckImei = await axios.get(`${BackedConfig.url}/v1/api/devices/${imei}`)
      if (responseCheckImei.status !== 200) return
      this.sock.write('01', 'hex')
      await this.redis.set(`imei/${this.sock.remoteAddress}`, imei)
      this.logError(`${imei} accepted to connect server`)
      return
    } catch (error: any) {
      console.error(error.message)
    }
  }

  crcCalc(data: Buffer) {
    return crc.crc16(data)
  }

  logError(message: string) {
    console.log(new Date().toISOString() + ' ' + this.sock.remoteAddress! + ' ' + message)
  }

  timestampCalc(timestamp: Buffer): Date {
    const unix = timestamp.readBigUInt64BE(0)
    return new Date(Number(unix))
  }

  gpsCalc(gps: Buffer) {
    return {
      longitude: (this.hexToNumber(gps.subarray(0, 4)) / 10000000).toString(),
      latitude: (this.hexToNumber(gps.subarray(4, 8)) / 10000000).toString(),
      altitude: this.hexToNumber(gps.subarray(8, 10)),
      angle: this.hexToNumber(gps.subarray(10, 12)),
      satelites: this.hexToNumber(gps.subarray(12, 13)),
      speed: this.hexToNumber(gps.subarray(13, 15))
    }
  }

  hexToNumber(hex: Buffer): number {
    const length = hex.length
    if (length <= 6) {
      return Number(hex.readIntBE(0, length))
    } else {
      return Number(hex.readBigInt64BE(0))
    }
  }
}