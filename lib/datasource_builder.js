let Promise = require('bluebird');
let pathFn = require('path');
let _ = require('lodash');
let fs = require('fs');
let SaxXmlParser = require("./xml-parser/sax_element_parser");
let FileParser = require("./xml-parser/file_parser");
const { execSync, spawn } = require('child_process');

function start_load_data(hexo) {
    return new Promise(function (resolve, reject) {
        init_sphinx_config(hexo);
        if (fs.existsSync(hexo.docsgen.docBuildDir)) {
            resolve();
        } else {
            return generate_docs_xml_by_sphinx(hexo, resolve, reject);
        }
    }).then(function () {
        return parse_sphinx_index(hexo);
    }).then(function () {
        let files = generate_page_list(hexo.sphinxData.categoryTree);
        hexo.sphinxData.files = files;
        return Promise.all([
            FileParser.process(hexo)
        ]);
    }).then(function () {
        return Promise.all([
            FileParser.post_parse_hook(hexo),
        ]);
    })
        .catch(function (error) {
            console.log(error);
        });
}

function generate_docs_xml_by_sphinx(hexo, resolve, reject) {
    return new Promise(function () {
        // Work with the repository object here.
        const ls = spawn('sphinx-build', ["-M", "xml", hexo.docsgen.docSourceDir, hexo.docsgen.docBuildDir], {
            cwd: hexo.config.docs_generator.project_source_dir
        });
        ls.stdout.on('data', (data) => {
            hexo.log.info(`${data}`);
        });
        ls.stderr.on('data', (data) => {
            hexo.log.warn(`${data}`);
        });
        ls.on('close', (code) => {
            if (0 !== code) {
                hexo.log.error("docgen error");
                reject("docgen error");
            } else {
                resolve();
            }
        });
    });
}

function init_sphinx_config(hexo) {
    let config = hexo.config.docs_generator;
    let tempDir = config.temp_dir;
    let docSourceDir = config.project_source_dir + "/doc/developer_manual/source_zh"
    let docBuildDir = config.project_source_dir + "/build"
    hexo.docsgen = {};
    hexo.docsgen.docSourceDir = docSourceDir;
    hexo.docsgen.docBuildDir = docBuildDir;
    hexo.docsgen.xmlDir = docBuildDir + "/xml";
}

function parse_sphinx_index(hexo) {
    let config = hexo.docsgen;
    let filename = config.xmlDir + "/index.xml";
    hexo.sphinxData = {
        pages: []
    };
    let parser = new SaxXmlParser(filename, hexo.sphinxData.pages, hexo);
    return parser.process();
}

function generate_page_list(categoryTree) {
    let list = [];
    for (let i = 0; i < categoryTree.length; ++i) {
        let item = categoryTree[i];
        if (!_.isArray(item)) {
            item.filename = item.refuri + '.xml';
            list.push(item);
        }
    }
    return list;
}

module.exports = start_load_data;