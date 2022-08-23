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
        let navMap = generate_line_navlist(hexo.sphinxData.categoryTree);
        return _.values(pages).map(function(page){
           return {
              path: basePath+"/"+page.filename.replace('xml', 'html'),
              layout: ["docs/content"],
              data: {
                 layout: "doccontent",
                 body: page.body,
                 title: page.pageTitle,
                 catalog: hexo.sphinxData.categoryTree,
                 navMap: navMap
              }
           };
        });
     });
}

// 生成手册线性导航数据
function generate_line_navlist(categoryTree) {
   var map = {};
   var items = [];
   for (let i = 0; i < categoryTree.length; ++i) {
      let item = categoryTree[i];
      if (!_.isArray(item)) {
         items.push(item);
      }
   }
   for (let i = 0; i < items.length; ++i) {
      let item = items[i];
      map[item.refuri] = nav = {};
      if (i == 0) {
         nav.next = {
            text: items[i + 1].text,
            url: items[i + 1].url,
         }
      } else if (i == items.length - 1) {
         nav.prev = {
            text: items[i - 1].text,
            url: items[i - 1].url,
         }
      } else {
         nav.prev = {
            text: items[i - 1].text,
            url: items[i - 1].url,
         }
         nav.next = {
            text: items[i + 1].text,
            url: items[i + 1].url,
         }
      }
   }
   return map;
}