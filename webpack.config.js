const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry:{
      sample: './src/handlers/sample/index.ts',
      nylas: './src/handlers/nylas/nylas.ts',
      nylasSqs: './src/handlers/nylas/nylassqs/nylassqs.ts',
      macropoint: './src/handlers/macropoint/macropoint.ts',
      createinvoice: './src/handlers/invoices/createinvoice.ts',
      factorintegration: './src/handlers/invoices/factorintegration.ts',
      sendEmail: './src/handlers/invoiceEmails/sendEmail.ts',
      zipFile: './src/handlers/invoiceDownloads/zipFile.ts',
      printInvoice: './src/handlers/invoicePrint/printInvoice.ts',
      relayPayments: './src/handlers/relayPayments/relayPayments.ts',
      truckerTools: './src/handlers/truckerTools/truckerTools.ts',
      orderFul: './src/handlers/orderful/orderful.ts'
  },
  externals: {
  },
  output: {
    path: path.resolve(__dirname, 'dist', 'handlers'),
    filename: '[name]/index.js',
    libraryTarget: 'umd',
  },
  resolve: {
	extensions: ['.ts', '.js'] // add your other extensions here
  },
  target: 'node',
  devtool: 'source-map',
  optimization: {
    minimize: false
  },
  module: {
	rules: [
		{
			test: /\.ts$/,
			loader: 'ts-loader',
			options: {
				configFile: path.resolve(__dirname, './tsconfig.json')
			},
			exclude: /node_modules/
		},
		{
			test: /\.node$/,
			loader: "node-loader",
		},
	]
  }
};