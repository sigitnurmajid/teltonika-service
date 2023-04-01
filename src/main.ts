import * as net from 'net'
import { InfluxDriver } from './influx'
import { Parser } from './parser'
import { createClient } from 'redis'
import { InfluxConfig, ServerConfig } from './config'

const port = ServerConfig.port
const host = ServerConfig.host

const server = net.createServer()
const influx = new InfluxDriver(InfluxConfig)
const redis = createClient()

redis.on('error', err => console.log('Redis Client Error', err))

server.listen(port, host, async () => {
  console.log('TCP Server is running on port ' + port + '.')
  await redis.connect();
});

server.on('connection', function (sock) {
  console.log('CONNECTED: ' + sock.remoteAddress + ':' + sock.remotePort)

  sock.on('data', async function (data) {
    try {
      // parse data return points influx
      const parse = new Parser(data, sock, redis)
      await parse.parse()

      // write points into influx
      await influx.writePoints(parse.points)
    } catch (error : any) {
      console.log(error.message)
    }
  })

  sock.on('close', function () {
    console.log('CLOSED: ' + sock.remoteAddress + ' ' + sock.remotePort);
  })
});