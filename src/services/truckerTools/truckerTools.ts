import {Database} from '../database/database';
import moment from 'moment';
import console from 'console';

export class TruckerTools {

    private dataBase: Database;
    private dataBaseGet: Database;

    constructor() {
        this.dataBase = new Database();
        this.dataBaseGet = new Database(true);
    }

    public async handleTruckerToolsResponse(req: any): Promise<any> {

        console.log(req, 'Request For Handling');

        if (req.eventType === 'LocationUpdate') {

            const loadValue = req.loadTrackExternalId ? req.loadTrackExternalId : null;

            const coId = await this.getLoadId(loadValue, 'CO')
            const coRelayId = await this.getLoadId(loadValue, 'RELAY')

            if ((coId !== null || coRelayId !== null)
                && req.latestLocation
                && req.latestLocation.lat
                && req.latestLocation.lon){

                const city = req.latestLocation.city;
                const state = req.latestLocation.state;
                const country = req.latestLocation.country;

                const request = {
                    coId: coId,
                    coRelayId: coRelayId,
                    createdAt: moment().utc().format('YYYY-MM-DD HH:mm:ss'),
                    isDeleted: 0,
                    latitude: req.latestLocation.lat,
                    location: `${city}, ${state}. ${country}`,
                    locationAt: req.latestLocation.timestampSec ? moment(req.latestLocation.timestampSec).format('YYYY-MM-DD HH:mm:ss') : null,
                    longitude: req.latestLocation.lon,
                }

                console.log(req.latestLocation, 'Last Location');
                await this.addLocationUpdates(request)

            }

        }
        return;

    }

    public async addLocationUpdates(req: any) {
        if (req.coId !== null || req.coRelayId !== null) {
            return this.dataBase.query(`
				INSERT
				INTO cocurrentlocation(Location, CustomerOrder_Id, LocationAt, IsDeleted, CreatedAt, CORelay_Id, Latitude, Longitude)
				VALUES (${req.location ? this.dataBase.connection.escape(req.location) : null},
						${req.coId ? this.dataBase.connection.escape(req.coId) : null},
						${req.locationAt ? this.dataBase.connection.escape(req.locationAt) : null},
						${req.isDeleted ? this.dataBase.connection.escape(req.isDeleted) : null},
						${req.createdAt ? this.dataBase.connection.escape(req.createdAt) : null},
						${req.coRelayId ? this.dataBase.connection.escape(req.coRelayId) : null},
						${req.latitude ? this.dataBase.connection.escape(req.latitude) : null},
						${req.longitude ? this.dataBase.connection.escape(req.longitude) : null}
					)
			`)
        } else {
            return null
        }
    }

    private async getLoadId(subject: any, value: any): Promise<any>{
        const regex = /[a-zA-Z]+/g;
        const val = subject.match(regex);
        const singleWord = val.join('');
        if(singleWord != null && singleWord.length > 0){
            if (singleWord === value){
                const regexNum = /[0-9]+/g;
                const newVal = subject.match(regexNum);
                const singleValue = newVal.join('');
                if(singleValue != null && singleValue.length > 0){
                    return singleValue[0]
                } else {
                    return null
                }
            } else {
                return null;
            }
        } else {
            return null;
        }

    }

}