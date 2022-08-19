let Promise = require("bluebird");
let fs = require("fs");
let xml2js = require("xml2js");
let _ = require('lodash');
let sax = require("sax");
let SaxXmlParser = require("./sax_element_parser");

module.exports = {
    process: function (context) {
        return Promise.mapSeries(_.values(context.sphinxData.files), function (fileItem) {
            let config = context.docsgen;
            let filename = config.xmlDir + '/' + fileItem.filename;
            let parser = new SaxXmlParser(filename, context.sphinxData.pages, context);
            return parser.process();
        });
    },

    post_parse_hook(context) {
        return Promise.resolve();
    }
};