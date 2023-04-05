import * as net from 'net'
import { InfluxDriver } from './influx'
import { Parser } from './parser'
import { createClient } from 'redis'
import { InfluxConfig, ServerConfig } from './config'
import { Point } from '@influxdata/influxdb-client'

const port = ServerConfig.port
const host = ServerConfig.host

const server = net.createServer()
const influx = new InfluxDriver(InfluxConfig)
const redis = createClient()

redis.on('error', err => console.log(new Date().toISOString() + ' Redis Client Error', err))

server.listen(port, host, async () => {
  console.log(new Date().toISOString() + ' TCP Server is running on port ' + port + '.')
  await redis.connect();
});

server.on('connection', function (sock) {
  console.log(new Date().toISOString() + ' CONNECTED: ' + sock.remoteAddress + ':' + sock.remotePort)

  sock.on('data', async function (data) {
    try {
      // parse data return points influx
      const parse = new Parser(data, sock, redis)
      await parse.parse()

      // write points into influx
      await influx.writePoints(parse.points)
    } catch (error: any) {
      console.error(new Date().toISOString() + ' Parse: ' + sock.remoteAddress! + ' ' + error)
    }
  })

  sock.on('close', async function () {
    console.log(new Date().toISOString() + ' CLOSED: ' + sock.remoteAddress + ':' + sock.remotePort)

    // Update status offline device
    try {
      const imei = await redis.get(`imei/${sock.remoteAddress}/${sock.remotePort}`)

      if (imei === null) return
      const statusTcpPoint = new Point('TCPStatus')
        .tag('imei', imei!)
        .stringField('status', 'OFFLINE')
        .stringField('IPAddress', sock.remoteAddress)
        .stringField('port', sock.remotePort)
      await influx.writePoint(statusTcpPoint)
      await redis.del(`imei/${sock.remoteAddress}/${sock.remotePort}`)
    } catch (error) {
      console.error(new Date().toISOString() + ' Update TCP status: ' + sock.remoteAddress! + ' ' + error)
    }
  })

  sock.on('error', (err) => {
    console.log(new Date().toISOString() + ' Caught flash policy server socket error: ' + err.stack)
  })
});