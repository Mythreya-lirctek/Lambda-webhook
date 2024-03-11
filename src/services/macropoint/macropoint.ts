import { Database } from '../database/database';

export class MacroPoint {

    private db: Database;

    constructor() {
        this.db = new Database();
    }

    public async getCoId(mpOrderId: any): Promise<any> {
        return this.db.query(`SELECT Id from customerorder where VisibilityOrderId = ${mpOrderId}`)
    }

    public async getCoRelayId(mpOrderId: any): Promise<any> {
        return this.db.query(`SELECT Id from corelay where VisibilityOrderId = ${mpOrderId}`)
    }

    public async addLocationUpdates(req: any) {
        if (req.coId !== null || req.coRelayId !== null) {
            return this.db.query(`
				INSERT
				INTO cocurrentlocation(Location, CustomerOrder_Id, LocationAt, IsDeleted, CreatedAt, CORelay_Id, Latitude, Longitude)
				VALUES (${req.location ? this.db.connection.escape(req.location) : null},
						${req.coId ? this.db.connection.escape(req.coId) : null},
						${req.locationAt ? this.db.connection.escape(req.locationAt) : null},
						${req.isDeleted ? this.db.connection.escape(req.isDeleted) : null},
						${req.createdAt ? this.db.connection.escape(req.createdAt) : null},
						${req.coRelayId ? this.db.connection.escape(req.coRelayId) : null},
						${req.latitude ? this.db.connection.escape(req.latitude) : null},
						${req.longitude ? this.db.connection.escape(req.longitude) : null},
			`)
        } else {
            return null
        }
    }
}