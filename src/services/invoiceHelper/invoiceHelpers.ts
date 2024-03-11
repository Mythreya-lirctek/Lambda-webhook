import { Database } from '../database/database';
import {DatabaseResponse} from '../database/database.interface';
import moment from 'moment/moment';

export class InvoiceHelpers {

    private dataBase: Database;
    private dataBaseGet: Database;

    constructor() {
        this.dataBase = new Database();
        this.dataBaseGet = new Database(true);
    }

    public async getContainerDocuments(req: any): Promise<any> {
        return this.dataBaseGet.query(`
            CALL getContainerDocuments_snew(
				${req.containerId},
				${req.containerName ? this.dataBase.connection.escape(req.containerName) : ''},
				${req.userId ? req.userId : null},
				${req.type ? req.type : 0}
            )`
        );
    }

    public getWOInvPrintByInvId(woInvoiceId: number): Promise<DatabaseResponse> {
        return this.dataBaseGet.query(`
			CALL getWOInvPrintByInvId_snew(
				${woInvoiceId}
			);
		`);
    }

    public getAccountReceivablesByWOInvoiceId(woInvoiceId: number): Promise<DatabaseResponse> {
        return this.dataBaseGet.query(`
			CALL getAccountReceivablesByWOInvoiceId_snew(
				${woInvoiceId}
			);
		`);
    }

    public getRateDetailsByWOId(workOrderId: number): Promise<DatabaseResponse> {
        return this.dataBaseGet.query(`
			CALL getRateDetailsByWOId_snew(
				${workOrderId}
			);
		`);
    }

    public getStopsByWOId(workOrderId: number): Promise<DatabaseResponse> {
        return this.dataBaseGet.query(`
			CALL getStopsByWOId_snew(
				${workOrderId}
			);
		`);
    }

    public async addWOInvoiceLog(req: any): Promise<any> {

        return this.dataBase.query(`
			Insert into woinvoicelog(WOInvoice_Id, Emails, Documents, IsMerged, DeliveredOn, createdAt, createdUserId)
			values(
				${req.woInvoiceId},
				${req.emailData ? this.dataBase.connection.escape(req.emailData) : null},
				${req.fileNames ? this.dataBase.connection.escape(req.fileNames) : null},
                ${req.isMerged},   
				${moment.utc().unix()},
				${moment.utc().unix()},
				${req.userId}
			)
		`);
    }

    public async addActivityLog(req: any): Promise<any> {
        return this.dataBase.query(`
            INSERT INTO activitylog(Module, Module_Id, Description, ActivityType, DeviceType, createdAt, createdUserId)
            Values(
                ${this.dataBase.connection.escape(req.module)},
                ${req.module_Id}, 
                ${req.description ? this.dataBase.connection.escape(req.description) : null},
                ${req.activityType ? this.dataBase.connection.escape(req.activityType) : null},
                ${req.deviceType ? this.dataBase.connection.escape(req.deviceType) : this.dataBase.connection.escape('Web')},
                UTC_TIMESTAMP,
                ${req.userId ? req.userId : null}
            )
        `);
    }

    public async saveWorkOrder(req: any): Promise<any> {
        let text = '';
        const driverFields: any = [
            'loadType', 'isIntermodal', 'refNumber', 'customer_Id', 'equipment_Id', 'billToType', 'billTo_Id', 'loadAmount', 'miles', 'notes', 'status_Id', 'isDeleted', 'isFullyPaid', 'legType', 'isHazmat','loadCategory','loadPriority','rateperMile','lumperPaidby','lumper','isBOLReceived','bolReceivedDate','contactPersonId','agent_Id','agentPCT','agentAmount','customerOrder_Id','isAltCompany','bolNumber','temperature','dispatcher_Id','isAgentPaid','agentPaidAmount','agentPaidDate','branch','subCompany_Id','hasDetention'];
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
        if (text && req.workOrderId) {
            text += ` UpdatedAt = UTC_TIMESTAMP, updatedUserId = ${req.userId}`;
            return this.dataBase.query(`
                UPDATE
                    workorder
                SET
                    ${text}
                WHERE
                    Id = ${req.workOrderId}
            `);
        } else {
            return null
        }
    }

    public async insertFactorBatchLog(req: any): Promise<any> {
        let text = '';
        const driverFields: any = ['details', 'updatedAt', 'updatedUserId', 'status', 'ExecutionEndTime'];
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
        if (text && req.batchNumber) {
            text += ` UpdatedAt = UTC_TIMESTAMP, ExecutionEndTime = UTC_TIMESTAMP, updatedUserId = ${req.userId}`;
            return this.dataBase.query(`
                UPDATE
                    factorbatchlog
                SET
                    ${text}
                WHERE
                    Id = ${req.id}
            `);
        } else {
            return null
        }
    }

    public async updateDOandRelayStatusbyWOId(workOrderId: number,status:number): Promise<any> {
        return this.dataBase.query(`
			CALL updateDOandRelayStatusbyWOId(
				${workOrderId},
				${status}
			);
		`);
    }

    public async saveWOInvoice(req: any): Promise<any> {
        let text = '';
        const driverFields: any = [
            'amount', 'notes', 'issuedDate', 'fullyPaidDesc', 'remitToAddress_Id', 'remitTo',
            'isQuickPay', 'quickPayAmount', 'quickPayPCT','broker_Id', 'internalNotes',
            'creditedAmount', 'debitedAmount', 'qbRefId', 'description_Id', 'factor_Id',
            'readyToBill', 'quickBookLastSyncedAt', 'quickBookError','isFactorGotPaid', 'factorReceivedDate', 'factorReceivedAmount'];
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
        if (text && req.woInvoiceId) {
            text += ` UpdatedAt = UTC_TIMESTAMP, updatedUserId = ${req.userId}`;
            return this.dataBase.query(`
                UPDATE
                    woinvoice
                SET
                    ${text}
                WHERE
                    Id = ${req.woInvoiceId}
            `);
        } else if (text && req.workOrderId) {
            text += ` UpdatedAt = UTC_TIMESTAMP, updatedUserId = ${req.userId}`;
            return this.dataBase.query(`
                UPDATE
                    woinvoice
                SET
                    ${text}
                WHERE
				workOrder_Id = ${req.workOrderId}
            `);
        } else {
            return null
        }
    }

    formatDate = (date: any, format: any) => {
        try {
            if (date && date !== '') {
                return moment(date, moment.ISO_8601).format(format)
            }
            else {
                return ''
            }
        }
        catch (e) {
            return ''
        }
    }

    invoiceHTML = (result: any) => {

        const logourl = result.logoUrl ? `https://lircteksams.s3.amazonaws.com/${result.logoUrl}` : ``;

        let htmlString = '';
        htmlString += `<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN" "http://www.w3.org/TR/REC-html40/loose.dtd"> <html lang="en" > <head> <meta http-equiv="Content-Type" content="text/html; charset=UTF-8"> <meta charset="UTF-8"> <title>Invoice</title> </head> <body style="color: #000 !important; font-family: Arial, Helvetica, sans-serif; font-size: 10px; line-height: 1.42857143; background-color: #fff; margin: 20px;" bgcolor="#fff">
			<table style="width:100%;font-size:10px;font-family: Arial;"> <tr>${(result.showOnlyLogo ? `<td colspan="1" style="padding-right: 0px;" width="50%" valign="top"> <img style="align:top;max-height: 60px;" src="${logourl}"> </td>` : `<td style="padding-right: 0px;" valign="top"> <img style="align:top;max-height: 60px;" src="${logourl}"> </td> 
			<td style="padding-left: 0px;font-size:12px;text-align:left;" width="40%" valign="top">${(result.showCompanyName ? `<span > 
			<b style="font-size:18px;">${result.companyName}</b></span><br>` : '')} ${result.companyAddress1} &nbsp;${(result.companyAddress2 ? result.companyAddress2 : '')}<br> ${result.companyCity} , ${result.companyState}&nbsp; ${result.companyZip}<br>
			<b>Ph: </b>${result.companyPhone} ${(result.ext ? `&nbsp;&nbsp; <b>EXT:</b>${result.ext}` : '')} &nbsp;&nbsp;&nbsp;${(result.companyFax ? `<br><b>Fax: </b>${result.companyFax}` : '')}
			<br><b>Email: </b>${result.email}  ${(result.mc ? `<br><b>MC: </b>${result.mc}` : '')}
			${(result.federalId ? `<br><b>Federal Id: </b>${result.federalId}` : '')}</td>`)}`;

        htmlString += ` <td align="left" style="font-size: 12px;text-align:right;"><b style="font-size: 28px;">INVOICE</b><br><b>Invoice # : </b>
			${result.invoiceNumber}<br><b>Issued Date : </b>${result.issuedDate}<br><b>Reference # : </b>${result.referenceNumber} ${(result.isFullLoad && !result.splitFullLoad && result.truckNumber ? `<br><b>Truck # : </b>${result.truckNumber}` : '')}  ${(result.isFullLoad && !result.splitFullLoad && result.showDriverName ? `<br><b>Driver Name : </b> ${(result.driver1Name ? result.driver1Name : '')}<br> ${(result.driver2Name ? result.driver2Name : '')}` : '')} <br></td></tr></table>`;

        htmlString += ` <br><table style="font-family: Arial;border-collapse: separate; border-spacing: 0; width: 100%;font-size:10px; "> <tr style="height:16px;"> <th style="font-size:12px;border-right: 1px solid #bbb; border-bottom: 1px solid #bbb;padding: 2px; border-left: 1px solid #bbb; background: #eee; border-top: 1px solid #bbb; text-align: left; border-top-left-radius: 6px;" width="50%">Bill To:</th> <th style="font-size:12px;border-right: 1px solid #bbb; border-bottom: 1px solid #bbb;padding: 2px; background: #eee; border-top: 1px solid #bbb; text-align: left;border-top-right-radius: 6px;">Remit To:</b></p></th></tr><tr><td style="border-right: 1px solid #bbb; border-bottom: 1px solid #bbb;padding: 5px;border-left: 1px solid #bbb;border-bottom-left-radius: 6px;"><b style="font-size: 12px;">${result.brokerName}</b><br>${result.brokerAddress1} ${(result.brokerAddress2 ? result.brokerAddress2 : '')} <br> ${result.brokerCity} ${result.brokerState}  ${result.brokerZip}</td><td style="border-right: 1px solid #bbb; border-bottom: 1px solid #bbb;padding: 5px;border-bottom-right-radius: 6px;"><b style="font-size: 12px;">${(result.isCareofFactor ? `${result.companyName} <br> C/O ${result.remitToName}` : result.remitToName)}</b><br> ${result.remitToAddress1} ${result.remitToAddress2 ? result.remitToAddress2 : ''} <br> ${result.remitToCity} ${result.remitToState}  ${result.remitToZip}</td></tr></table>
			${this.stopsHTML(result.stops, result.isDate24HrFormat)}   
			${(result.isFullLoad && !result.splitFullLoad && result.showDriverName && result.truckNumber ? `<br><table style="font-family: Arial;border-collapse: separate; border-spacing: 0; width: 100%; font-size:11px;"> <tr> <th style="border-right: 1px solid #bbb; border-bottom: 1px solid #bbb;padding: 5px; border-left: 1px solid #bbb; background: #eee; border-top: 1px solid #bbb; text-align: left; border-top-left-radius: 6px;" width="55%">Drivers</th> <th style="border-right: 1px solid #bbb; border-bottom: 1px solid #bbb;padding: 5px; background: #eee; border-top: 1px solid #bbb; text-align: left; " width="15%">Trucks</th> <th style="border-right: 1px solid #bbb; border-bottom: 1px solid #bbb;padding: 5px; background: #eee; border-top: 1px solid #bbb; text-align: left; " width="15%">Trailers</th> <th style="border-right: 1px solid #bbb; border-bottom: 1px solid #bbb;padding: 5px; background: #eee; border-top: 1px solid #bbb; text-align: left;border-top-right-radius: 6px;">Payment Terms</th> </tr>${this.loadTrucksDrivers(result)}</table>` : '')}        
			<br><br><table style="font-family: Arial;border-collapse: separate; border-spacing: 0; width: 100%; font-size:11px;"> <tr> <th style="border-right: 1px solid #bbb; border-bottom: 1px solid #bbb;padding: 5px; border-left: 1px solid #bbb; background: #eee; border-top: 1px solid #bbb; text-align: left; border-top-left-radius: 6px;" width="55%">Description</th> <th style="border-right: 1px solid #bbb; border-bottom: 1px solid #bbb;padding: 5px; background: #eee; border-top: 1px solid #bbb; text-align: left; " width="15%">Units</th> <th style="border-right: 1px solid #bbb; border-bottom: 1px solid #bbb;padding: 5px; background: #eee; border-top: 1px solid #bbb; text-align: left; " width="15%">Per</th> <th style="border-right: 1px solid #bbb; border-bottom: 1px solid #bbb;padding: 5px; background: #eee; border-top: 1px solid #bbb; text-align: right;border-top-right-radius: 6px;">Amount</th> </tr>
			${this.rateDetails(result.rateDetails)} 
			 ${this.accountReceivables(result.accountReceivables)} 
			<tr><td style="border-right: 1px solid #bbb; border-bottom: 1px solid #bbb;padding: 5px;border-left: 1px solid #bbb;border-bottom-left-radius: 6px;" colspan="3" align="right" ><b style="font-size: 12px;">Remaining Balance</b></td><td style="border-right: 1px solid #bbb; border-bottom: 1px solid #bbb;padding: 5px;border-bottom-right-radius: 6px;" align="right"><b style="font-size: 12px;">$${(result.isFullyPaid ? (0.00).toFixed(2) : (result.amount - (result.totalARAmount > 0 ? result.totalARAmount : 0)).toFixed(2))}</b></td> </tr></table> ${(result.notes ? `<br><br><b>Notes:</b>&nbsp; ${result.notes}` : '')}  ${(result.remitTo === 'Factor' && !result.stampURL ? `<br><p>Notice of Assignment This Account has been assigned and must be paid only to ${result.remitToName} &nbsp;${result.remitToAddress1} &nbsp; ${result.remitToAddress2 ? result.remitToAddress2 : ''} &nbsp; ${result.remitToCity} &nbsp; ${result.remitToState} &nbsp; ${result.remitToZip} &nbsp; ${result.remitToName} must be promptly notified at ${(result.factorPhone ? result.factorPhone : `-`)}  of any claims or offsets against this invoice</p>` : (result.stampURL ? `<center><img style="align:top;" src="https://lircteksams.s3.ap-southeast-1.amazonaws.com/${result.stampURL}"></center>` : ''))} <footer><p style="text-align: end;">Powered by: <a target="blank" style="vertical-align: sub;" href="https://www.awako.ai/"><img style="height: 19px;" src="https://app.awako.ai/images/logos/logo-2.png"></a></p></footer></body></html>`;

        return htmlString;
    };

    accountReceivables = (receivables: any) => {
        let htmlString = '';

        if (receivables.length > 0) {
            for (const item of receivables) {
                htmlString += `<tr><td style="border-right: 1px solid #bbb; border-bottom: 1px solid #bbb;padding: 5px;border-left: 1px solid #bbb;" colspan="3" align="right" >Amount Received on - ${item.paymentDate}</td><td style="border-right: 1px solid #bbb; border-bottom: 1px solid #bbb;padding: 5px;border-bottom-right-radius: 6px;" align="right">-$${(item.amount > 0 ? item.amount : 0).toFixed(2)}</td> </tr>`;
            }
        }

        return htmlString;
    };

    loadTrucksDrivers = (result: any) => {
        let htmlString = '';

        if (result.truckNumber) {
            htmlString += `<tr style="font-size: 11px"><td style="border-right: 1px solid #bbb; border-bottom: 1px solid #bbb;padding: 5px;border-left: 1px solid #bbb;"> ${result.driver1Name + (result.driver2Name ? `<br>${result.driver2Name}` : '')}</td> <td style="border-right: 1px solid #bbb; border-bottom: 1px solid #bbb;padding: 5px;">${result.truckNumber}</td><td style="border-right: 1px solid #bbb; border-bottom: 1px solid #bbb;padding: 5px;">${(result.trailerNumber ? result.trailerNumber : '')}</td><td style="border-right: 1px solid #bbb; border-bottom: 1px solid #bbb;padding: 5px;border-bottom-right-radius: 6px;">${(result.paymenterms ? result.paymenterms : '')}</td> </tr>`;
        }

        if (result.rTrucks) {
            result.rTrucks = result.rTrucks.split(',');
            result.rDriver1Name = (result.rDriver1Name ? result.rDriver1Name.split(',') : '');
            result.rDriver2Name = (result.rDriver2Name ? result.rDriver2Name.split(',') : '');
            result.rTrailers = (result.rTrailers ? result.rTrailers.split(',') : '');

        }

        return htmlString;
    };


    rateDetails = (rates: any) => {
        let htmlString = '';
        let total = 0;

        for (const rate of rates) {
            htmlString += `<tr style="font-size: 11px"><td style="border-right: 1px solid #bbb; border-bottom: 1px solid #bbb;padding: 5px;border-left: 1px solid #bbb;">${rate.name} </td> <td style="border-right: 1px solid #bbb; border-bottom: 1px solid #bbb;padding: 5px;">${rate.units}</td><td style="border-right: 1px solid #bbb; border-bottom: 1px solid #bbb;padding: 5px;">${rate.per}</td><td style="border-right: 1px solid #bbb; border-bottom: 1px solid #bbb;padding: 5px;border-bottom-right-radius: 6px;" align="right">$${(rate.amount ? rate.amount.toFixed(2) : 0)}</td> </tr>`;
            total += rate.amount;
        }

        htmlString += `<tr><td style="border-right: 1px solid #bbb; border-bottom: 1px solid #bbb;padding: 5px;border-left: 1px solid #bbb;border-bottom-left-radius: 6px;" colspan="3" align="right" ><b style="font-size: 12px;">TOTAL</b></td><td style="border-right: 1px solid #bbb; border-bottom: 1px solid #bbb;padding: 5px;border-bottom-right-radius: 6px;" align="right"><b style="font-size: 12px;">$${total.toFixed(2)}</b></td> </tr>`;

        return htmlString;
    };

    stopsHTML = (stops: any, isDate24HrFormat: any) => {
        let htmlString = `<br>`;

        if (stops.length > 0) {
            htmlString += `<table style="font-family: Arial;border-collapse: separate; border-spacing: 0; width: 100%;font-size:10px; ">`;
            htmlString += `<tr> <th style="font-size:12px;border-right: 1px solid #bbb; border-bottom: 1px solid #bbb;padding: 2px; border-left: 1px solid #bbb; background: #eee; border-top: 1px solid #bbb; text-align: left; border-top-left-radius: 6px;border-top-right-radius: 6px;padding-top:2px;">Stops</b></p></th></tr>`;

        }

        for (const stop of stops) {
            let typeText = `PU`;
            if (stop.stopType === 'Delivery') {
                typeText = 'CO';
            }

            if (stop !== (stops.length - 1)) {
                htmlString += `<tr> <td style="border-right: 1px solid #bbb; border-bottom: 1px solid #bbb;padding: 5px;border-left: 1px solid #bbb;"> <table style="width: 100%; max-width: 100%;font-size:10px;">`;
            } else {
                htmlString += `<tr> <td style="border-right: 1px solid #bbb; border-bottom: 1px solid #bbb;padding: 5px;border-left: 1px solid #bbb;border-bottom-left-radius: 6px;border-bottom-right-radius: 6px;"> <table style="width: 100%; max-width: 100%;font-size:10px;">`;
            }
            htmlString += `<tr> <td><b style="font-size: 12px;">${stop.stopNumber}. ${stop.facilityName}</b>  &nbsp;&nbsp;&nbsp;&nbsp; - &nbsp;&nbsp;&nbsp; <b style="font-size:10px;text-transform: uppercase;">${stop.stopType}</b> <br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="padding-top:5px;font-size: 10px">${stop.address1} ${stop.address2 ? stop.address2 : ''}<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ${stop.location} </span> ${(stop.phone ? `<br><b>Ph: </b>${stop.phone}` : '')}</td><td style="width:45%; font-size: 11px;" valign="top"><b style="font-size: 12px;">${typeText} #: </b> ${(stop.poNumber ? stop.poNumber : '')} ${(stop.appNumber ? `<br><b style="font-size: 12px;">Appt #: </b>${stop.appNumber}` : '')} <br><b style="font-size: 12px;">Date & Time: </b> ${this.formatDate(stop.fromDate, 'MM/DD/YYYY')}  ${((stop.toDate && (stop.toDate !== '0000-00-00 00:00:00')) ? `- ${this.formatDate(stop.toDate, 'MM/DD/YYYY')}` : '')}  ${((stop.fromTime && (stop.fromTime !== '0000-00-00 00:00:00')) ? `${(isDate24HrFormat ? this.formatDate(stop.fromTime, 'HH:mm') : this.formatDate(stop.fromTime, 'hh:mm a'))}` : '')}  ${((stop.toTime && (stop.toTime !== '0000-00-00 00:00:00')) ? `- ${(isDate24HrFormat ? this.formatDate(stop.toTime, 'HH:mm') : this.formatDate(stop.toTime, 'hh:mm a'))}` : '')}  ${(stop.shippingHours ? `<br><b>Shipping Hours: </b>${stop.shippingHours}` : '')}</td></tr>`;
            htmlString += `<tr> <td colspan="2"> <table width="100%" style="padding-top: 15px;padding-left: 10px;padding-right: 10px;padding-bottom: 10px;font-size:10px; border-spacing: 0;"> <tr> <td width="15%" style="padding-left: 5px;border-bottom: 1px dotted #bbb;border-right: 1px dotted #bbb;"> <b>ItemNumber</b> </td> <td width="10%" style="padding-left: 5px;border-bottom: 1px dotted #bbb;border-right: 1px dotted #bbb;"> <b>PO#</b> </td> <td width="10%" style="padding-left: 5px;border-bottom: 1px dotted #bbb;border-right: 1px dotted #bbb;"> <b>CO#</b> </td> <td width="20%" style="padding-left: 5px;border-bottom: 1px dotted #bbb;border-right: 1px dotted #bbb;"> <b>Commodity</b> </td> <td width="10%" style="padding-left: 5px;border-bottom: 1px dotted #bbb;border-right: 1px dotted #bbb;"> <b>Weight</b> </td> <td width="10%" style="padding-left: 5px;border-bottom: 1px dotted #bbb;border-right: 1px dotted #bbb;"> <b>Pallets</b> </td> <td width="10%" style="padding-left: 5px;border-bottom: 1px dotted #bbb;border-right: 1px dotted #bbb;"> <b>Count</b> </td> <td width="25%" style="padding-left: 5px;border-bottom: 1px dotted #bbb;"> <b>Temp</b> </td> </tr>`;

            for (const item of stop.stopItems) {
                htmlString += `<tr><td style="padding-left: 5px;border-right: 1px dotted #bbb;">${(item.itemNumber ? item.itemNumber : '')} </td><td style="padding-left: 5px;border-right: 1px dotted #bbb;">${(item.poNumber ? item.poNumber : '')} </td><td style="padding-left: 5px;border-right: 1px dotted #bbb;">${(item.coNumber ? item.coNumber : '')} </td><td style="padding-left: 5px;border-right: 1px dotted #bbb;">${(item.commodity ? item.commodity : '')} </td><td style="padding-left: 5px;border-right: 1px dotted #bbb;">${(item.weight ? item.weight : '')}</td><td style="padding-left: 5px;border-right: 1px dotted #bbb;">${(item.pallets ? item.pallets : '')}</td><td style="padding-left: 5px;border-right: 1px dotted #bbb;">${(item.pieceCount ? item.pieceCount : '')}</td><td style="padding-left: 5px;">${(item.temperature ? item.temperature : '')}</tr>`;
            }

            htmlString += `</table></td></tr>`;
            htmlString += `</table></td> </tr>`;
        }
        htmlString += `</table>`;

        return htmlString;
    };
}