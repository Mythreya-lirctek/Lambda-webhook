import { Database } from '../database/database';
import console from "console";
import moment from 'moment';
import { diff } from 'deep-object-diff';

export class OrderFulService{

    private dataBase: Database;
    private dataBaseGet: Database;

    constructor() {
        this.dataBase = new Database();
        this.dataBaseGet = new Database(true);
    }

    public async handleOrderFulResponse(requestBody: any): Promise<any> {

        const req = JSON.parse(requestBody) || {};
        const senderId = req.sender ? req.sender.isaId ? req.sender.isaId : null : null;
        const receiverId = req.receiver ? req.receiver.isaId ? req.receiver.isaId : null : null;
        console.log(senderId, 'Sender Id')
        console.log(receiverId, 'Receiver Id')
        let loadTenderId = 0;

        try {

            const companyIntegrations = await this.getCompanyIdFromReceiverId(receiverId)
            if (companyIntegrations.data
                && companyIntegrations.data.length > 0
                && companyIntegrations.data[0].Company_Id
                && req.message
                && req.message.transactionSets
                && req.message.transactionSets.length > 0){

                const companyId = companyIntegrations.data[0].Company_Id;

                for (const transactionSet of req.message.transactionSets){

                    const errorMessages = [];
                    const missingFields = [];
                    const loadTender = {} as any;

                    if (transactionSet.transactionSetHeader
                        && transactionSet.transactionSetHeader.length > 0
                        && transactionSet.transactionSetHeader[0].transactionSetIdentifierCode
                        && transactionSet.transactionSetHeader[0].transactionSetIdentifierCode === '204'
                        && transactionSet.setPurpose
                        && transactionSet.setPurpose.length > 0
                        && transactionSet.setPurpose[0].applicationTypeCode
                        && transactionSet.setPurpose[0].applicationTypeCode === 'LT'){

                        loadTender.companyId = companyId;

                        if (transactionSet.dateTime && transactionSet.dateTime.length > 0) {
                            try {
                                let date = '';
                                let time = '';
                                if (transactionSet.dateTime[0].date && transactionSet.dateTime[0].date !== ''){
                                    date = moment(transactionSet.dateTime[0].date).format('YYYY-MM-DD');
                                }
                                if (transactionSet.dateTime[0].time && transactionSet.dateTime[0].time !== ''){
                                    const firstPart = (transactionSet.dateTime[0].time).slice(0, 2)
                                    const lastPart = (transactionSet.dateTime[0].time).slice(2, 4)
                                    time = firstPart + ':' + lastPart+':00'
                                }
                                loadTender.respondByDate = `${date} ${time}`;
                                loadTender.respondByTime = `${date} ${time}`;
                            } catch (e) {
                                missingFields.push(`Date and Time Not Found`);
                            }
                        } else {
                            missingFields.push(`Date and Time Not Found`);
                        }

                        if (transactionSet.noteSpecialInstruction
                            && transactionSet.noteSpecialInstruction.length > 0
                            && transactionSet.noteSpecialInstruction[0].description) {
                            loadTender.specialInstructions = transactionSet.noteSpecialInstruction[0].description;
                        } else {
                            missingFields.push('Missing Instructions/Notes');
                        }

                        if (transactionSet.AT5_loop
                            && transactionSet.AT5_loop.length > 0
                            && transactionSet.AT5_loop[0]
                            && transactionSet.AT5_loop[0].billOfLadingHandlingRequirements
                            && transactionSet.AT5_loop[0].billOfLadingHandlingRequirements > 0
                            && transactionSet.AT5_loop[0].billOfLadingHandlingRequirements[0]
                            && transactionSet.AT5_loop[0].billOfLadingHandlingRequirements[0].specialHandlingCode){
                            loadTender.specialHandlingCode = transactionSet.AT5_loop[0].billOfLadingHandlingRequirements[0].specialHandlingCode;
                        }

                        if (transactionSet.beginningSegmentForShipmentInformationTransaction
                            && transactionSet.beginningSegmentForShipmentInformationTransaction.length > 0
                            && transactionSet.beginningSegmentForShipmentInformationTransaction[0].shipmentIdentificationNumber){
                            loadTender.shipmentId = transactionSet.beginningSegmentForShipmentInformationTransaction[0].shipmentIdentificationNumber;
                            loadTender.shipmentCode = transactionSet.beginningSegmentForShipmentInformationTransaction[0].standardCarrierAlphaCode;
                        } else {
                            missingFields.push('Missing Shipment No.');
                        }

                        if (transactionSet.N7_loop
                            && transactionSet.N7_loop.length > 0
                            && transactionSet.N7_loop[0].equipmentDetails
                            && transactionSet.N7_loop[0].equipmentDetails.length > 0
                            && transactionSet.N7_loop[0].equipmentDetails[0].equipmentDescriptionCode){
                            this.getEquipmentType(transactionSet.N7_loop[0].equipmentDetails[0].equipmentDescriptionCode).then(result => {
                                loadTender.equipmentType = result
                            });
                            loadTender.equipmentLength = transactionSet.N7_loop[0].equipmentDetails[0].equipmentLength;
                        } else {
                            missingFields.push('Missing Equipment Type');
                        }

                        if (req.sender
                            && req.sender.isaId) {
                            loadTender.tradingPartnerId = req.sender.isaId;
                        } else {
                            missingFields.push('Missing Trading Partner Id');
                        }

                        if (transactionSet.totalWeightAndCharges
                            && transactionSet.totalWeightAndCharges.length > 0
                            && transactionSet.totalWeightAndCharges[0].amountCharged){
                            loadTender.totalCharge = transactionSet.totalWeightAndCharges[0].amountCharged;
                        }

                        if (transactionSet.setPurpose[0].transactionSetPurposeCode === '00'){
                            //Original - NEED TO INSERT

                            loadTender.purpose = 'Original';

                            const localLoadTenderModel = await this.getLocalLoadTenderModel(loadTender.companyId,
                                loadTender.tradingPartnerId);
                            if (localLoadTenderModel.data
                                && localLoadTenderModel.data.length > 0
                                && localLoadTenderModel.data[0].Contact_Id) {
                                loadTender.billToId = localLoadTenderModel.data[0].Contact_Id;
                            } else {
                                missingFields.push('Missing Bill To Id');
                            }

                            try {
                                const addedLoadTender = await this.createLoadTender(loadTender);
                                if (addedLoadTender.data.insertId) {
                                    loadTenderId = addedLoadTender.data.insertId;
                                    loadTender.loadTenderId = addedLoadTender.data.insertId;
                                } else {
                                    errorMessages.push(`Error Adding Load Tender-> LoadTender-ShipmentId: ${loadTender.ShipmentId}`)
                                }
                            } catch (e: any) {
                                errorMessages.push(`Failed to Create Load Tender-> LoadTender-ShipmentId: ${loadTender.ShipmentId}, Error : ${e.message}`)
                            }

                            console.log('ERROR', errorMessages)
                            console.log('LOAD TENDER', loadTender)
                            console.log('MISSING FIELDS', missingFields)

                            await this.updateLoadTenderDetails(req, loadTender, transactionSet, req)

                            if (missingFields.length > 0
                                && loadTender.loadTenderId) {
                                await this.updateLoadTenderMissingFields(missingFields, loadTender.loadTenderId)
                            }

                        } else if (transactionSet.setPurpose[0].transactionSetPurposeCode === '01'
                            || transactionSet.setPurpose[0].transactionSetPurposeCode === '04'){
                            //Cancellation/Change - NEED TO CANCEL/CHANGE

                            const validateLoadTender = await this.validateLoadTender(
                                loadTender.companyId,
                                loadTender.shipmentId,
                                loadTender.tradingPartnerId
                            );

                            let changes = req

                            if (validateLoadTender.data
                                && validateLoadTender.data.length > 0
                                && validateLoadTender.data[0].length > 0
                                && validateLoadTender.data[0][0].Id) {

                                const loadTenderData = validateLoadTender.data[0][0];
                                loadTenderId = loadTenderData.Id;
                                loadTender.loadTenderId = loadTenderData.Id;
                                loadTender.billToId = loadTenderData.BillTo_Id

                                changes = diff(JSON.parse(loadTenderData.TenderData), req);
                                loadTender.isOpened = 0;

                                await this.updateLoadTenderDB(loadTender);
                                await this.deleteLoadTenderData(loadTenderData.Id);

                            } else {

                                const localLoadTenderModel = await this.getLocalLoadTenderModel(loadTender.companyId, loadTender.tradingPartnerId);
                                if (localLoadTenderModel.data
                                    && localLoadTenderModel.data.length > 0) {

                                    loadTender.billToId = localLoadTenderModel.data[0].Contact_Id
                                    const addedLoadTender = await this.createLoadTender(loadTender);
                                    if (addedLoadTender.data.insertId) {
                                        loadTenderId = addedLoadTender.data.insertId;
                                        loadTender.loadTenderId = addedLoadTender.data.insertId;
                                    }
                                }

                            }

                            console.log('LOAD TENDER', loadTender)
                            console.log('MISSING FIELDS', missingFields)

                            await this.updateLoadTenderDetails(req, loadTender, transactionSet, changes)

                            if (missingFields.length > 0
                                && loadTender.loadTenderId) {
                                await this.updateLoadTenderMissingFields(missingFields, loadTender.loadTenderId)
                            }

                        }

                    }
                }

            }

            return req

        } catch (e: any) {
            if (loadTenderId > 0) {
                const updatedData = {
                    error: e.message,
                    loadTenderId: loadTenderId
                }
                await this.updateLoadTenderData(updatedData);
            }
            return e.message
        }

    }

    public async getEquipmentType(key: any): Promise<any>{
        const map = new Map();
        map.set('FT', 'Flat Bed Trailer');
        map.set('RT', 'Reefer');
        map.set('TF', 'Dry Freight');
        map.set('TL', 'Trailer');
        return map.has(key) ? map.get(key) : 'Trailer'
    }

    public async updateLoadTenderData(req: any): Promise<any> {
        let text = '';
        const lineFields: any = ['error'];
        Object.keys(req).map((key) => {
            if (lineFields.indexOf(key) > -1) {
                if (typeof req[key] === 'string') {
                    // tslint:disable-next-line: prefer-template
                    text += key + `=${this.dataBase.connection.escape(req[key])},`;
                } else {
                    // tslint:disable-next-line: prefer-template
                    text += key + '=' + `${req[key]}` + ',';
                }
            }
        });
        if (text && req.loadTenderId) {
            text += ` UpdatedAt = UTC_TIMESTAMP`;
            return this.dataBase.query(`
                UPDATE
                    loadTenders
                SET
                    ${text}
                WHERE
                    Id = ${req.loadTenderId}
            `);
        } else {
            return null
        }
    }

    public async deleteLoadTenderData(loadTenderId: any): Promise<any>{
        return this.dataBaseGet.query(`
			CALL deleteLoadtenderData(
				${loadTenderId}
			)
		`)
    }

    public async updateLoadTenderDB(req : any): Promise<any> {
        let text = '';
        const driverFields: any = [
            'company_Id',
            'tradingPartnerId',
            'shipmentId',
            'purpose',
            'equipmentType',
            'specialInstructions',
            'paymentTerms',
            'respondByDate',
            'respondByTime',
            'timeZone',
            'totalCharge',
            'billTo_Id',
            'miles',
            'isOpened'
        ];
        Object.keys(req).map((key) => {
            if (driverFields.indexOf(key) > -1) {
                if (typeof req[key] === 'string') {
                    // tslint:disable-next-line: prefer-template
                    text += key + `=${this.dataBase.connection.escape(req[key])},`;
                } else {
                    // tslint:disable-next-line: prefer-template
                    text += key + '=' + `${req[key]}` + ',';
                }
            }
        });
        if (text && req.loadTenderId) {
            text += ` UpdatedAt = UTC_TIMESTAMP`;
            return this.dataBase.query(`
                UPDATE
				loadtenders
                SET
                    ${text}
                WHERE
                    Id = ${req.loadTenderId}
            `);
        } else {
            return null
        }
    }

    public async validateLoadTender(companyId: number, shipmentId: any, tradingPartnerId: any): Promise<any> {
        return this.dataBaseGet.query(`
		 CALL ValidateLoadtender(
		 	${companyId},
		 	${this.dataBase.connection.escape(shipmentId)},
		 	${this.dataBase.connection.escape(tradingPartnerId)}
		 )
		`)
    }

    private async updateLoadTenderDetails(
        req: any,
        loadTender: any,
        transactionSet: any,
        changes: any
    ): Promise<any> {

        if (loadTender.billToId
            && loadTender.loadTenderId) {

            if (transactionSet.businessInstructionsAndReferenceNumber) {
                for (const referenceData of transactionSet.businessInstructionsAndReferenceNumber) {
                    const refNums = {} as any
                    refNums.referenceType = referenceData.referenceIdentificationQualifier ? referenceData.referenceIdentificationQualifier  : ''
                    refNums.referenceText = referenceData.referenceIdentificationQualifier ?
                        (referenceData.referenceIdentificationQualifier === 'AO') ? 'Appointment Number' :
                            (referenceData.referenceIdentificationQualifier === 'P8') ? 'Pickup Reference Number' : '' : ''
                    refNums.referenceValue = referenceData.referenceIdentification ? referenceData.referenceIdentification : '';
                    refNums.loadTenderId = loadTender.loadTenderId
                    console.log('REF NUMS', refNums)
                    await this.createReferenceNo(refNums)
                }
            }

            await this.updateLog(
                loadTender.purpose,
                loadTender.loadTenderId,
                req,
                changes,
                null,
                null,
                req
            );

            if (transactionSet.S5_loop
                && transactionSet.S5_loop.length > 1){

                for (const stopDetail of transactionSet.S5_loop) {

                    const stopMissingFields = [];
                    const stopData = {} as any;

                    stopData.loadTenderId = loadTender.loadTenderId;

                    if (stopDetail.stopOffDetails
                        && stopDetail.stopOffDetails.length > 0
                        && stopDetail.stopOffDetails[0].stopSequenceNumber){
                        stopData.stopNum = stopDetail.stopOffDetails[0].stopSequenceNumber
                    } else {
                        stopMissingFields.push('Missing Stop Number')
                    }

                    if (stopDetail.stopOffDetails
                        && stopDetail.stopOffDetails.length > 0
                        && stopDetail.stopOffDetails[0].stopReasonCode){
                        this.getStopReason(stopDetail.stopOffDetails[0].stopReasonCode).then(result => {
                            stopData.stopReason = result
                        });
                    } else {
                        stopMissingFields.push('Missing Stop Reason')
                    }

                    if (stopDetail.dateTime && stopDetail.dateTime.length > 0) {

                        try {
                            for (const dateTime of stopDetail.dateTime){

                                let date = '';
                                let time = '';
                                if (stopDetail.dateTime[0].date && stopDetail.dateTime[0].date !== ''){
                                    date = moment(stopDetail.dateTime[0].date).format('YYYY-MM-DD');
                                    stopData.expectedDate = date
                                }
                                if (stopDetail.dateTime[0].time && stopDetail.dateTime[0].time !== ''){
                                    const firstPart = (stopDetail.dateTime[0].time).slice(0, 2)
                                    const lastPart = (stopDetail.dateTime[0].time).slice(2, 4)
                                    time = firstPart + ':' + lastPart+':00'
                                } else {
                                    time = '00:00:00'
                                }

                                if (dateTime.dateQualifier
                                    && (dateTime.dateQualifier === 10 || dateTime.dateQualifier === 53)){
                                    stopData.expectedTimeStart = `${date} ${time}`;

                                } else if (dateTime.dateQualifier
                                    && (dateTime.dateQualifier === 54 || dateTime.dateQualifier === 78)){
                                    stopData.expectedTimeEnd = `${date} ${time}`;
                                }
                            }
                        } catch (e) {
                            stopMissingFields.push(`Date and Time Not Found`);
                        }
                    } else {
                        stopMissingFields.push(`Date and Time Not Found`);
                    }

                    if (stopDetail.noteSpecialInstruction
                        && stopDetail.noteSpecialInstruction.length > 0
                        && stopDetail.noteSpecialInstruction[0].description) {
                        stopData.stopInstructions = stopDetail.noteSpecialInstruction[0].description;
                    }

                    if (stopDetail.N1_loop
                        && stopDetail.N1_loop.length > 0
                        && stopDetail.N1_loop[0].partyIdentification
                        && stopDetail.N1_loop[0].partyIdentification.length > 0
                        && stopDetail.N1_loop[0].partyIdentification[0].entityIdentifierCode) {
                        stopData.stopType = (stopDetail.N1_loop[0].partyIdentification[0].entityIdentifierCode === 'ST') ? 'Delivery' : 'Pickup';
                    }

                    console.log('STOP DATA', stopData)
                    const createdStop = await this.createStop(stopData);
                    if (createdStop.data
                        && createdStop.data.insertId) {

                        stopData.stopId = createdStop.data.insertId;
                        console.log('STOP DATA AFTER STOP ID', stopData)

                        if (stopDetail.businessInstructionsAndReferenceNumber) {
                            for (const referenceData of stopDetail.businessInstructionsAndReferenceNumber) {
                                const refNums = {} as any
                                refNums.referenceType = referenceData.referenceIdentificationQualifier ? referenceData.referenceIdentificationQualifier  : ''
                                refNums.referenceText = referenceData.referenceIdentificationQualifier ?
                                    (referenceData.referenceIdentificationQualifier === 'AO') ? 'Appointment Number' :
                                        (referenceData.referenceIdentificationQualifier === 'P8') ? 'Pickup Reference Number' : '' : ''
                                refNums.referenceValue = referenceData.referenceIdentification ? referenceData.referenceIdentification : '';
                                refNums.loadTenderId = loadTender.loadTenderId
                                refNums.stopsId = createdStop.data.insertId;
                                console.log('STOP REF NUMS', refNums)
                                await this.createReferenceNo(refNums)
                            }
                        }

                        const stopAddress = {} as any;
                        const stopContact = {} as any;

                        if (stopDetail.N1_loop
                            && stopDetail.N1_loop.length > 0
                            && stopDetail.N1_loop[0].partyLocation
                            && stopDetail.N1_loop[0].partyLocation.length > 0
                            && stopDetail.N1_loop[0].geographicLocation
                            && stopDetail.N1_loop[0].geographicLocation.length > 0){

                            if (stopDetail.N1_loop[0].partyLocation[0].addressInformation) {
                                stopAddress.address1 = stopDetail.N1_loop[0].partyLocation[0].addressInformation;
                            }

                            if (stopDetail.N1_loop[0].partyLocation[0].addressInformation1) {
                                stopAddress.address2 = stopDetail.N1_loop[0].partyLocation[0].addressInformation1;
                            }

                            if (stopDetail.N1_loop[0].geographicLocation[0].cityName
                                && stopDetail.N1_loop[0].geographicLocation[0].stateOrProvinceCode
                                && stopDetail.N1_loop[0].geographicLocation[0].postalCode){
                                stopAddress.city = stopDetail.N1_loop[0].geographicLocation[0].cityName;
                                stopAddress.state = stopDetail.N1_loop[0].geographicLocation[0].stateOrProvinceCode;
                                stopAddress.zip = stopDetail.N1_loop[0].geographicLocation[0].postalCode;
                            }
                        } else {
                            stopMissingFields.push('Stop Address Not Found');
                        }

                        if (stopDetail.N1_loop
                            && stopDetail.N1_loop.length > 0
                            && stopDetail.N1_loop[0].contact
                            && stopDetail.N1_loop[0].contact.length > 0){

                            if (stopDetail.N1_loop[0].contact[0].name) {
                                stopContact.contactPerson = stopDetail.N1_loop[0].contact[0].name;
                            }

                            if (stopDetail.N1_loop[0].contact[0].communicationNumber) {
                                stopContact.phone = stopDetail.N1_loop[0].contact[0].communicationNumber
                            }

                        } else {
                            stopMissingFields.push('Stop Contact Name and Communication No. Not Found');
                        }

                        if (stopDetail.N1_loop
                            && stopDetail.N1_loop.length > 0
                            && stopDetail.N1_loop[0].partyIdentification
                            && stopDetail.N1_loop[0].partyIdentification.length > 0
                            && stopDetail.N1_loop[0].partyIdentification[0].name) {

                            stopContact.name = stopDetail.N1_loop[0].partyIdentification[0].name

                        } else {
                            stopMissingFields.push('Stop Contact Name');
                        }

                        console.log('STOP ADDRESS', stopAddress)
                        console.log('STOP CONTACT', stopContact)
                        console.log('STOP MISSING FIELDS', stopMissingFields)

                        const contactByNameAddress = await this.contactByNameAddress(
                            loadTender.companyId,
                            stopContact,
                            stopAddress
                        );
                        if (contactByNameAddress.data && contactByNameAddress.data[0]) {
                            if (contactByNameAddress.data[0].length === 0) {

                                const address = await this.createAddress(stopAddress);
                                if (address.data && address.data.insertId) {
                                    stopContact.addressId = address.data.insertId;
                                    stopContact.companyId = loadTender.companyId;
                                    stopContact.ContactType = 'Facility';
                                    const createContact = await this.createContact(stopContact);

                                    if (createContact.data.insertId) {
                                        const stopContacts = {} as any;
                                        stopContacts.stopsId = createdStop.data.insertId;
                                        stopContacts.contactId = createContact.data.insertId;
                                        stopContacts.companyId = loadTender.companyId;
                                        await this.createStopContact(stopContacts);
                                    }
                                }

                            } else {
                                const stopContacts = {} as any;
                                stopContact.addressId = stopContacts.stopsId = createdStop.data.insertId;
                                stopContacts.contactId = contactByNameAddress.data[0].Id;
                                stopContacts.companyId = loadTender.companyId;
                                await this.createStopContact(stopContacts);

                            }

                            console.log('STOP CONTACT AFTER ID', stopContact)

                        }


                        if (stopDetail.OID_loop
                            && stopDetail.OID_loop.length > 0
                            && stopDetail.OID_loop[0].orderInformationDetail) {

                            for (const orderInfo of stopDetail.OID_loop[0].orderInformationDetail) {

                                const itemValues = {} as any
                                itemValues.loadTenderId = loadTender.loadTenderId;
                                itemValues.itemNum = orderInfo.referenceIdentification1;
                                itemValues.poNumber = orderInfo.purchaseOrderNumber;
                                itemValues.pickupStopNum = stopDetail.stopOffDetails[0].stopSequenceNumber;
                                itemValues.dropoffStopNum = stopDetail.stopOffDetails[0].stopSequenceNumber;
                                itemValues.desc = orderInfo.referenceIdentification;
                                itemValues.weight = orderInfo.weight;
                                itemValues.weightUnits = 'Pounds';
                                itemValues.packagingUnitCount = orderInfo.volume;
                                itemValues.packagingUnit = 'Cubic Feet';
                                itemValues.isHazardousMaterials = '';
                                await this.createLoadTenderItem(itemValues)
                            }

                        }

                        if (stopMissingFields.length > 0 && stopData.stopId) {
                            await this.updateStopMissingFields(stopMissingFields, stopData.stopId)
                        }

                    }

                }
            }

        }
        return { message : 'Load Tender Updated Successfully' }
    }

    public async getStopReason(key: any): Promise<any>{
        const map = new Map();
        map.set('CL', 'Complete');
        map.set('CU', 'Complete Unload');
        map.set('DT', 'Drop Trailer');
        map.set('LD', 'Load');
        map.set('PL', 'Part Load');
        map.set('PU', 'Part Unload');
        map.set('RT', 'Retrieval of Trailer');
        map.set('UL', 'Unload');
        return map.has(key) ? map.get(key) : ''
    }

    public async updateStopMissingFields(missingFields: any, stopId: any): Promise<any>{
        return this.dataBase.query(
            `UPDATE stops SET MissingFields=${missingFields ? this.dataBase.connection.escape(JSON.stringify(missingFields)) : ''} WHERE Id=${stopId}`
        )
    }

    public async createLoadTenderItem(itemValues : any): Promise<any>{
        return this.dataBase.query(`
			INSERT INTO loadtenderitems(
			    LoadTender_Id, 
			    PickupStopNum, 
			    DropoffStopNum, 
			    ItemNum, 
			    \`Desc\`, 
			    HandlingUnitCount, 
			    HandlingUnit, 
			    PackagingUnitCount, 
			    PackagingUnit, 
			    Weight, 
			    WeightUnits, 
				Length, 
				Width, 
				Height, 
				DimensionUnits, 
				Volume, 
				VolumeUnits, 
				NmfcClass, 
				IsHazardousMaterials, 
				PONumber, 
				CONumber, 
				createdAt
			)
			VALUES(
				${itemValues.loadTenderId ? itemValues.loadTenderId : null},
				${itemValues.pickupStopNum ? itemValues.pickupStopNum  : 0},
				${itemValues.dropoffStopNum ? itemValues.dropoffStopNum  : 0},
				${itemValues.itemNum ? this.dataBase.connection.escape(itemValues.itemNum)  : null},
				${itemValues.desc ? this.dataBase.connection.escape(itemValues.desc)  : null},
				${itemValues.handlingUnitCount ? itemValues.handlingUnitCount  : 0},
				${itemValues.handlingUnit ? this.dataBase.connection.escape(itemValues.handlingUnit)  : null},
				${itemValues.packagingUnitCount ? itemValues.packagingUnitCount  : 0},
				${itemValues.packagingUnit ? this.dataBase.connection.escape(itemValues.packagingUnit)  : null},
				${itemValues.weight ? itemValues.weight  : null},
				${itemValues.weightUnits ? this.dataBase.connection.escape(itemValues.weightUnits)  : null},
				${itemValues.length ? itemValues.length  : 0},
				${itemValues.width ? itemValues.width  : 0},
				${itemValues.height ? itemValues.height  : 0},
				${itemValues.dimensionUnits ? this.dataBase.connection.escape(itemValues.dimensionUnits)  : null},
				${itemValues.volume ? itemValues.volume  : 0},
				${itemValues.volumeUnits ? this.dataBase.connection.escape(itemValues.volumeUnits)  : null},
				${itemValues.nmfcClass ? itemValues.nmfcClass  : 0},
				${itemValues.isHazardousMaterials ? itemValues.isHazardousMaterials : 0},
				${itemValues.poNumber ? this.dataBase.connection.escape(itemValues.poNumber)  : null},
				${itemValues.coNumber ? this.dataBase.connection.escape(itemValues.coNumber)  : null},
				${this.dataBase.connection.escape(moment.utc().format('YYYY-MM-DD HH:mm:ss'))}
			)
		`)
    }

    public async createStopContact(stopContact: any): Promise<any> {
        return this.dataBase.query(`
			INSERT INTO stopcontacts(Stops_Id, Contact_Id, CompanyId, createdAt)
			VALUES(
				${stopContact.stopsId ? stopContact.stopsId : null},
				${stopContact.contactId ? stopContact.contactId : null},
				${stopContact.companyId ? stopContact.companyId : null},
				${this.dataBase.connection.escape(moment.utc().format('YYYY-MM-DD HH:mm:ss'))}
			)
		`)
    }

    public async createAddress(stopContactAddress: any): Promise<any> {
        return this.dataBase.query(`
			INSERT INTO address(Address1, Address2, City, State, Zip, createdAt)
			VALUES(
				${stopContactAddress.address1 ? this.dataBase.connection.escape(stopContactAddress.address1) : null},
				${stopContactAddress.address2 ? this.dataBase.connection.escape(stopContactAddress.address2) : null},
				${stopContactAddress.city ? this.dataBase.connection.escape(stopContactAddress.city) : null},
				${stopContactAddress.state ? this.dataBase.connection.escape(stopContactAddress.state) : null},
				${stopContactAddress.zip ? this.dataBase.connection.escape(stopContactAddress.zip) : null},
				${this.dataBase.connection.escape(moment.utc().format('YYYY-MM-DD HH:mm:ss'))}
			)
		`)
    }

    public async createContact(stopContact: any): Promise<any> {
        return this.dataBase.query(`
			INSERT INTO contact(Name, Phone, Fax, Email, Company_Id, ContactType, Address_Id, createdAt)
			VALUES(
				${stopContact.name ? this.dataBase.connection.escape(stopContact.name) : null},
				${stopContact.phone ? this.dataBase.connection.escape(stopContact.phone) : null},
				${stopContact.fax ? this.dataBase.connection.escape(stopContact.fax) : null},
				${stopContact.email ? this.dataBase.connection.escape(stopContact.email) : null},
				${stopContact.companyId ? stopContact.companyId : null},
				${stopContact.contactType ? this.dataBase.connection.escape(stopContact.contactType) : null},
				${stopContact.addressId ? stopContact.addressId : null},
				${this.dataBase.connection.escape(moment.utc().format('YYYY-MM-DD HH:mm:ss'))}
			)
		`)
    }

    public async contactByNameAddress(companyId: any, stopContact: any, stopContactAddress: any): Promise<any> {
        return this.dataBase.query(`
			CALL getContactByNameAdress(
				${companyId},
				${stopContact.name ? this.dataBase.connection.escape(stopContact.name) : null},
				'Facility',
				${stopContactAddress.address1 ? this.dataBase.connection.escape(stopContactAddress.address1) : null},
				${stopContactAddress.address2 ? this.dataBase.connection.escape(stopContactAddress.address2) : null},
				${stopContactAddress.city ? this.dataBase.connection.escape(stopContactAddress.city) : null},
				${stopContactAddress.state ? this.dataBase.connection.escape(stopContactAddress.state) : null},
				${stopContactAddress.zip ? this.dataBase.connection.escape(stopContactAddress.zip) : null},
				1,
				0
			)
		`)
    }

    public async createStop(stopData: any): Promise<any>{
        return this.dataBase.query(`
			INSERT INTO stops(
			    LoadTender_Id, 
			    StopNum, 
			    StopType, 
			    StopInstructions, 
			    ApptRequired, 
			    ExpectedDate, 
			    ExpectedTimeStart, 
			    ExpectedTimeEnd, 
			    TimeZone, 
			    createdAt
			)
			VALUES(
				${stopData.loadTenderId},
				${stopData.stopNum ? this.dataBase.connection.escape(stopData.stopNum) : null},
				${stopData.stopType ? this.dataBase.connection.escape(stopData.stopType) : null},
				${stopData.stopInstructions ? this.dataBase.connection.escape(stopData.stopInstructions) : null},
				${stopData.apptRequired ? this.dataBase.connection.escape(stopData.apptRequired) : null},
				${stopData.expectedDate ? this.dataBase.connection.escape(stopData.expectedDate) : null},
				${stopData.expectedTimeStart ? this.dataBase.connection.escape(stopData.expectedTimeStart) : null},
				${stopData.expectedTimeEnd ? this.dataBase.connection.escape(stopData.expectedTimeEnd) : null},
				${stopData.timeZone ? this.dataBase.connection.escape(stopData.timeZone) : null},
				${this.dataBase.connection.escape(moment.utc().format('YYYY-MM-DD HH:mm:ss'))}
			)
		`)
    }

    public async updateLoadTenderMissingFields(missingFields: any, loadTenderId: any): Promise<any>{
        return this.dataBase.query(
            `UPDATE loadtenders SET MissingFields=${missingFields ? this.dataBase.connection.escape(JSON.stringify(missingFields)) : ''} WHERE Id=${loadTenderId}`
        )
    }

    private async updateLog(purpose: string,
                            loadTenderId: any,
                            record: any,
                            changes: any,
                            userId: any,
                            request: any,
                            response: any
    ): Promise<any> {
        try {
            const log = {} as any
            log.purpose = purpose;
            log.loadTenderId = loadTenderId;
            log.tenderData = record ? JSON.stringify(record) : '';
            log.changes = changes ? JSON.stringify(changes) : '';
            log.request = request ? JSON.stringify(request) : '';
            log.response = response ? JSON.stringify(response) : '';
            log.userId = userId;
            await this.ediLoadTenderUpdateLog(log);
            return;
        } catch (e) {
            return;
        }
    }

    public async ediLoadTenderUpdateLog(req: any): Promise<any>{
        return this.dataBase.query(`
			INSERT INTO ediloadtenderupdatelog(
			    Purpose, 
			    LoadTender_Id, 
			    TenderData, 
			    Changes, 
			    createdUserId, 
			    Request, 
			    Response, 
			    createdat
			)
			VALUES(
				${req.purpose ? this.dataBase.connection.escape(req.purpose) : null},
				${req.loadTenderId ? req.loadTenderId : null},
				${req.tenderData ? this.dataBase.connection.escape(req.tenderData) : null},
				${req.changes ? this.dataBase.connection.escape(req.changes) : null},
				${req.userId ? req.userId : 0},
				${req.request ? this.dataBase.connection.escape(req.request) : null},
				${req.response ? this.dataBase.connection.escape(req.response) : null},
				UTC_TIMESTAMP
			)
		`)
    }

    public async createLoadTender(req: any): Promise<any> {
        return this.dataBase.query(`
			INSERT INTO loadtenders(
			    Company_Id, 
			    TradingPartnerId, 
			    ShipmentId, 
			    Purpose, 
			    EquipmentType, 
			    PaymentTerms, 
			    SpecialInstructions, 
			    BillTo_Id, 
			    Miles, 
			    RespondByDate, 
			    RespondByTime, 
				TimeZone, 
				TotalCharge, 
				CurrencyCode,
				SpecialHandlingCode,
				ShipmentCode,
				EquipmentLength
		    )
			VALUES(
				${req.companyId},
				${req.tradingPartnerId ? this.dataBase.connection.escape(req.tradingPartnerId) : null},
				${req.shipmentId ? this.dataBase.connection.escape(req.shipmentId) : null},
				${req.purpose ? this.dataBase.connection.escape(req.purpose) : null},
				${req.equipmentType ? this.dataBase.connection.escape(req.equipmentType) : null},
				${req.paymentTerms ? this.dataBase.connection.escape(req.paymentTerms) : null},
				${req.specialInstructions ? this.dataBase.connection.escape(req.specialInstructions) : null},
				${req.billToId ? req.billToId : null},
				${req.miles ? this.dataBase.connection.escape(req.miles) : null},
				${req.respondByDate ? this.dataBase.connection.escape(req.respondByDate) : null},
				${req.respondByTime ? this.dataBase.connection.escape(req.respondByTime) : null},
				${req.timeZone ? this.dataBase.connection.escape(req.timeZone) : null},
				${req.totalCharge ? this.dataBase.connection.escape(req.totalCharge) : null},
				${req.currencyCode ? this.dataBase.connection.escape(req.currencyCode) : null},
				${req.specialHandlingCode ? this.dataBase.connection.escape(req.specialHandlingCode) : null},
				${req.shipmentCode ? this.dataBase.connection.escape(req.shipmentCode) : null},
				${req.equipmentLength ? this.dataBase.connection.escape(req.equipmentLength) : null}
			)
		`)
    }

    public async createReferenceNo(refNums: any): Promise<any>{
        return this.dataBase.query(`
			INSERT INTO referencenums(
			    LoadTender_Id, 
			    Stops_Id, 
			    ReferenceType, 
			    ReferenceText, 
			    ReferenceValue, 
			    createdAt
			)
			VALUES(
				${refNums.loadTenderId ? refNums.loadTenderId : 0},
				${refNums.stopsId ? refNums.stopsId : 0},
				${refNums.referenceType ? this.dataBase.connection.escape(refNums.referenceType) : null},
				${refNums.referenceText ? this.dataBase.connection.escape(refNums.referenceText) : null},
				${refNums.referenceValue ? this.dataBase.connection.escape(refNums.referenceValue) : null},
				${this.dataBase.connection.escape(moment.utc().format('YYYY-MM-DD HH:mm:ss'))}
			)
		`)
    }

    public async getLocalLoadTenderModel(companyId: any, tradingPartnerId: any): Promise<any>{
        return this.dataBaseGet.query(
            `SELECT Contact_Id FROM tradingpartners WHERE company_Id=${companyId} and tradingpartnerId=${this.dataBase.connection.escape(tradingPartnerId)}`
        );
    }

    public async getCompanyIdFromReceiverId(receiverId: any): Promise<any> {
        return this.dataBaseGet.query(
            `SELECT Company_Id FROM companyintegrations WHERE CustomerId = '${receiverId}'`
        );
    }

}