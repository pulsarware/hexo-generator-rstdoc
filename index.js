let DsBuilder = require("./lib/datasource_builder");
let Promise = require("bluebird");
let _ = require('lodash');
let fs = require('fs');
const gitclone = require('git-clone/promise');
let path = require('path');
require("./lib/helper")(hexo);
let ncp = require('ncp').ncp;
let fx = require('mkdir-recursive');
ncp.limit = 16;

let generateDocs = true;//!!hexo.env.args.withDocs;
let forceUpdateRepo = !!hexo.env.args.forceUpdateRepo;

let rootDir = path.normalize(__dirname+"/../..");
let tempDir = rootDir+"/temp";
let config = hexo.config.docs_generator;
let projectRepo = config.repo_url;
let sourceDir = tempDir + "/" +config.project_name;
config.temp_dir = tempDir;
config.project_source_dir = sourceDir;
config.project_local_apidoc = rootDir+"/temp/" +config.project_name+ "/temp/docs_html";
config.apidoc_path = "api";
let doGenerted = false;

if (generateDocs) {
    doGenerted = true;
    hexo.extend.filter.register("before_generate", function(){
        return new Promise(function (resolve, reject)
        {
           if (!fs.existsSync(sourceDir)) {
              hexo.log.info(`begin clone repo ${projectRepo}`);
              return gitclone(projectRepo, sourceDir).then(function ()
              {
                 resolve()
              });
           } else {
              resolve()
           }
        }).then(function(){
            return DsBuilder(hexo);
        });
    }, 1);

    hexo.extend.generator.register('docfilecontent', function(locals) {
        let config = hexo.config.docs_generator;
        let basePath = config.publish_dir;
        let pages = hexo.sphinxData.pages;
        console.log(hexo.sphinxData.pages);
        return _.values(pages).map(function(page){
           return {
              path: basePath+"/"+page.filename.replace('xml', 'html'),
              layout: ["docs/content"],
              data: {
                 layout: "doccontent",
                 file: file,
                 files: files
              }
           };
        });
     });
}