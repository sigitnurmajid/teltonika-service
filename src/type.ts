export interface IGPSData {
    longitude: string,
    latitude: string,
    altitude: string,
    angle: string,
    satellites: string,
    speed: string
}

export interface IMetaData {
    timestamp: Date,
    priority: string,
    imei: string
}