import PDFService from './pdf.service';
import AWS from 'aws-sdk';
import {ConfigService} from '../config/config.service';
import console from 'console';
import {InvoiceHelpers} from '../invoiceHelper/invoiceHelpers';
import {AwsHelper} from '../awsHelper/awsHelper';

export class CreateInvoices {

	private pdfService: PDFService;
	private invoiceHelpers: InvoiceHelpers;
	private awsHelper: AwsHelper;

	constructor() {
		this.pdfService = new PDFService();
		this.invoiceHelpers = new InvoiceHelpers();
		this.awsHelper = new AwsHelper();
		AWS.config.update({
			accessKeyId: ConfigService.configs.aws.AWSAccessKeyId,
			secretAccessKey: ConfigService.configs.aws.secretKey
		});
	}

	public async getContainerDocumentsForInvoicesAndMerge(invoice: any): Promise<any>{

		const params = {
			containerId: invoice.workOrderId,
			containerName: 'workorder'
		};

		const documentResults = await this.invoiceHelpers.getContainerDocuments(params);
		const documents = [];
		if (documentResults.data[0]) {
			for (const doc of documentResults.data[0]) {
				if (doc.addToInvoice === 1){
					documents.push(doc)
				}
			}
		}

		let invoicesResult: any;
		const stops = [];
		let amount = 0;
		invoice.fileNames = 'Invoice';
		invoice.batchLog = [];
		invoice.documents = [];
		invoice.errors = [];
		invoice.files = [];

		const invoicePrintResult = await this.invoiceHelpers.getWOInvPrintByInvId(Number(invoice.woInvoiceId));

		const invoiceResult = invoicePrintResult.data[0];
		invoicesResult = invoiceResult[0];
		invoicesResult.accountReceivables = [];

		if (invoicesResult.receivablesCount > 0) {
			const arResult = await this.invoiceHelpers.getAccountReceivablesByWOInvoiceId(Number(invoice.woInvoiceId));
			invoicesResult.accountReceivables = arResult.data[0];
			invoicesResult.totalARAmount = 0;
			for (const i of invoicesResult.accountReceivables) {
				amount += i.Amount;
			}
			invoicesResult.totalARAmount = amount;
		}

		const rdResult = await this.invoiceHelpers.getRateDetailsByWOId(Number(invoice.workOrderId));
		invoicesResult.rateDetails = rdResult.data[0];

		const stopResult = await this.invoiceHelpers.getStopsByWOId(Number(invoice.workOrderId));

		for (const stop of stopResult.data[0]) {
			stop.stopItems = (stop.stopItems ? JSON.parse(`[ ${stop.stopItems} ]`) : []);
			stops.push(stop);
		}

		invoicesResult.stops = stops;

		const htmlResult = await this.pdfService.generatePdf(this.invoiceHelpers.invoiceHTML(invoicesResult));
		const invoiceUrl = await this.awsHelper.uploadToS3(invoice, htmlResult)
		console.log(invoiceUrl, ' : Result From Generating Invoice')

		if (invoiceUrl.message){
			const error = invoiceUrl.message
			invoice.errors.push({ invoice_Id: invoice.woInvoiceId, invoiceNumber: invoice.loadNumber, error });
		} else {

			if (invoice.type === 1) {

				const files = [];
				if (invoiceUrl.key) {
					files.push({url: invoiceUrl.key, name: `Invoice-${invoice.workOrderId}`});
				}

				for (const doc of documents) {
					if (doc.url) {
						files.push({url: doc.url, name: doc.fileName})
						invoice.fileNames += `;${doc.fileName}`;
					}
				}

				console.log(invoice.fileNames, 'Contained Files')
				if (files.length > 0) {
					const documentAwsUrl = await this.awsHelper.getDocumentMergeAndPush(files, invoice)
					if (documentAwsUrl.message){
						const error = documentAwsUrl.message
						invoice.errors.push({ invoice_Id: invoice.woInvoiceId, invoiceNumber: invoice.loadNumber, error });
					} else if (documentAwsUrl.mergedUrl) {
						invoice.files.push(documentAwsUrl.mergedUrl)
					}
				}

			} else if (invoice.type === 2) {

				const files = [];
				if (invoiceUrl.key && invoice.isIncludeInvoice === 1){
					files.push({url : invoiceUrl.key, name : `Invoice-${invoice.workOrderId}`});
				}

				for (const doc of documents) {
					if (doc.url){
						files.push({ url : doc.url, name : doc.fileName})
						invoice.fileNames += `;${doc.fileName}`;
					}
				}

				if (invoice.mergeFiles === 1) {

					invoice.isMerged = invoice.mergeFiles;
					if (files.length > 0) {
						const documentAwsUrl = await this.awsHelper.getDocumentMergeAndPush(files, invoice)
						if (documentAwsUrl.message){
							const error = documentAwsUrl.message
							invoice.errors.push({ invoice_Id: invoice.woInvoiceId, invoiceNumber: invoice.loadNumber, error });
						} else if (documentAwsUrl.mergedUrl) {
							invoice.files.push({ url : documentAwsUrl.mergedUrl, name: invoice.loadNumber})
						}
					}
				} else {
					invoice.isMerged = 0;
					for (const file of files){
						invoice.files.push(file);
					}
				}

				invoice.emailData = '';

				for (let e = 0; e < invoice.emails.length; e++) {
					invoice.emailData += `${invoice.emails[e]} ;`;
				}

			} else if (invoice.type === 3) {

				const files = [];
				if (invoiceUrl.key && invoice.isIncludeInvoice === 1){
					files.push({url : invoiceUrl.key, name : `Invoice-${invoice.workOrderId}`});
				}

				if (invoice.otherDocuments === 1) {
					for (const doc of documents) {
						if (doc.url) {
							files.push({url: doc.url, name: doc.fileName})
							invoice.fileNames += `;${doc.fileName}`;
						}
					}
				}

				if (invoice.mergeFiles === 1) {

					invoice.isMerged = invoice.mergeFiles;
					if (files.length > 0) {
						const documentAwsUrl = await this.awsHelper.getDocumentMergeAndPush(files, invoice)
						if (documentAwsUrl.message){
							const error = documentAwsUrl.message
							invoice.errors.push({ invoice_Id: invoice.woInvoiceId, invoiceNumber: invoice.loadNumber, error });
						} else if (documentAwsUrl.mergedUrl) {
							invoice.files.push({ url : documentAwsUrl.mergedUrl, name: invoice.loadNumber})
						}
					}
				} else {
					invoice.isMerged = 0;
					for (const file of files){
						invoice.files.push(file);
					}
				}

			} else {

				const files = [];
				if (invoiceUrl.key) {
					files.push({url: invoiceUrl.key, name: `Invoice-${invoice.workOrderId}`});
				}

				for (const doc of documents) {
					if (doc.url) {
						files.push({url: doc.url, name: doc.fileName})
						invoice.fileNames += `;${doc.fileName}`;
					}
				}

				console.log(invoice.fileNames, 'Contained Files')
				if (files.length > 0) {
					const documentAwsUrl = await this.awsHelper.getDocumentMergeAndPush(files, invoice)
					if (documentAwsUrl.message){
						const error = documentAwsUrl.message
						invoice.errors.push({ invoice_Id: invoice.woInvoiceId, invoiceNumber: invoice.loadNumber, error });
					} else if (documentAwsUrl.mergedUrl) {
						invoice.files.push({ url : documentAwsUrl.mergedUrl, name: invoice.loadNumber})
					}
				}

			}
		}

		invoice.batchLog.push({ invoice_Id: invoice.woInvoiceId, invoiceNumber: invoice.loadNumber, documents: invoice.fileNames });
		return invoice

	}

}