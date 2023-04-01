import * as dotenv from 'dotenv'
dotenv.config()

export interface IInfluxConfig {
    url: string,
    token: string,
    orgId: string,
    bucket: string
}

export interface IServerConfig {
    host: string,
    port: number
}

export const InfluxConfig: IInfluxConfig = {
    url: process.env.INFLUX_URL || '',
    token: process.env.INFLUX_TOKEN || '',
    bucket: process.env.INFLUX_BUCKET || '',
    orgId: process.env.INFLUX_ORG || ''
}

export const ServerConfig: IServerConfig = {
    port: parseInt(process.env.SERVER_PORT || '8877'),
    host: process.env.SERVER_URL || '127.0.0.1'
}

export const BackedConfig = {
    url : process.env.BACKEND_URL
}