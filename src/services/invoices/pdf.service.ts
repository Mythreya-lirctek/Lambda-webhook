import jsreport from 'jsreport-client';
import { PassThrough } from 'stream';

class PdfService {
	private jsReportClient: any;
	constructor() {
		this.jsReportClient = jsreport(
			'http://docugen.etruckingsoft.com:5488',
			'admin',
			'password'
		);
	}

	public async generatePdf(htmlContent: string, options: any = {}): Promise<PassThrough> {
		return this.jsReportClient.render({
			template: {
				content: htmlContent,
				engine: 'none',
				recipe: 'chrome-pdf',
				...options
			}
		});
	}
}

export default PdfService;