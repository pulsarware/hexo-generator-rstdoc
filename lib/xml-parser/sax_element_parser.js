let sax = require("sax");
let Promise = require("bluebird");
let fs = require("fs");
let _ = require('lodash');
let toString = Object.prototype.toString;
// let Utils = require("../utils");
let pathFn = require('path');
let hljs = require('highlight.js');
hljs.configure({
   classPrefix: "hljs-"
});
let markdownEngine = require('markdown-it')({
   html: true,
   linkify: true,
   typographer: true,
   highlight: function (str, lang) {
      if (lang && hljs.getLanguage(lang)) {
         try {
            return '<pre class="hljs"><code>' +
               hljs.highlight(lang, str, true).value +
               '</code></pre>';
         } catch (__) {}
      }

      return '<pre class="hljs"><code>' + markdownEngine.utils.escapeHtml(str) + '</code></pre>';
   }
});

function is_array(object)
{
   return toString.call(object) == "[object Array]";
}

function Parser(filename, container, context)
{
   this.xmlStream = sax.createStream(true);
   this.filename = filename;
   this.container = container;
   this.register = context.sphinxData;
   this.xmlStream.on("opentag", _.bind(this.opentagHandler, this));
   this.xmlStream.on("closetag", _.bind(this.closetagHandler, this));
   this.xmlStream.on("text", _.bind(this.textHandler, this));
   this.parseContextStack = [];
   this.hexo = context;
   this.persistDataPool = new Map();
   this.hexo.counter = 0;
}

Parser.SIMPLE_VALUES_TAGS = [
   "name",
   "declname",
   "defname",
   "scope",
   //markdown
];

// Parser.REF_TPL = '<a href = "{url}" class="{cls}">{name}</a>';
Parser.REF_TPL = '<a href = "{url}">{name}</a>';

Parser.prototype = {

   popParseContext: function()
   {
      return this.parseContextStack.pop();
   },

   getParseContext: function()
   {
      return this.parseContextStack[this.parseContextStack.length - 1];
   },

   opentagHandler: function(node)
   {
      this.hexo.counter++;
      // 派发事件
      let tagName = node.name;
      let beginMethodName = "beginParse"+_.capitalize(tagName);
      if (this[beginMethodName]) {
         this[beginMethodName](node);
      } else {
         // 判断是否在simpleValue 里面
         if (_.indexOf(Parser.SIMPLE_VALUES_TAGS, tagName) != -1) {
            this.beginParseSimpleValueTag(node);
         }
      }
   },

   closetagHandler: function(tagName)
   {
      let endMethodName = "endParse"+_.capitalize(tagName);
      if (this[endMethodName]) {
         if(this[endMethodName](tagName)) {
            return;
         }
      }
      let context = this.getParseContext();
      if (context && context.tagName == tagName) {
         this.popParseContext();
      }
   },

   textHandler: function(text)
   {
      let context = this.getParseContext();
      if (context) {
         let tagName = context.tagName;
         // text 拦截器
         let notifyTextHandler = "notify"+_.capitalize(tagName)+"Text";
         if (this[notifyTextHandler] && this[notifyTextHandler](text)) {
            return;
         }
         if (tagName == "innerclass" ||
            tagName == "innernamespace" ||
            tagName == "innergroup") {
            context.targetContainer.name = text;
         } else if (_.indexOf(Parser.SIMPLE_VALUES_TAGS, tagName) != -1) {
            context.targetContainer[tagName] = text;
         }
      }
   },

   process: function()
   {
      let me = this;
      return new Promise(function (resolve, reject)
      {
         me.xmlStream.on("end", function(){
            resolve();
         });
         me.xmlStream.on("error", function(error){
            reject(error);
         });
         fs.createReadStream(me.filename).pipe(me.xmlStream);
      });
   },

   canParse: function()
   {
      return this.parseContextStack.length > 0;
   },

   beginParseDocument : function(node)
   {
      let attrs = node.attributes;
      let depth = 1;
      let data = {
         source: attrs.source,
         categoryTree : null,
         body : ''
      };
      this.parseContextStack.push({
         node: node,
         tagName: node.name,
         targetContainer: data,
         depth: depth++
      });
   },

   endParseDocument(tagName)
   {
      let context = this.popParseContext();
      if (!_.isNil(context.targetContainer.categoryTree)) {
         this.hexo.sphinxData.categoryTree = context.targetContainer.categoryTree;
         delete context.targetContainer.categoryTree;
      }
      context.targetContainer.filename = this.filename.substring(this.filename.lastIndexOf('/') + 1);
      this.container.push(context.targetContainer);
      return true;
   },

   beginParseSection : function(node)
   {
      let context = this.getParseContext();
      let attrs = node.attributes;
      let targetContainer = context.targetContainer;
      let body = targetContainer.body;
      let ids = '';
      if (!_.isEmpty(attrs.ids)) {
         ids = 'id = "' + attrs.ids + '"';
      }
      body += `<div ${ids}>`;
      this.parseContextStack.push({
         node: node,
         tagName: node.name,
         targetContainer: {
            body: body
         },
         depth: ++context.depth
      });
   },

   endParseSection: function()
   {
      let selfContext = this.popParseContext();
      let parentContext = this.getParseContext();
      let targetContainer = selfContext.targetContainer;
      let body = targetContainer.body;
      body += "</div>";
      parentContext.targetContainer.body = body;
      parentContext.targetContainer.categoryTree = targetContainer.categoryTree
      return true;
   },

   beginParseCompound : function(node)
   {
      let context = this.getParseContext();
      let attrs = node.attributes;
      let targetContainer = context.targetContainer;
      let body = targetContainer.body;
      let ids = '';
      let classes = '';
      if (!_.isEmpty(attrs.ids)) {
         ids = 'id = "' + attrs.ids + '"';
      }
      if (!_.isEmpty(attrs.classes)) {
         classes = 'class = "' + attrs.classes + '"';
      }
      body += `<div ${ids} ${classes}>`;

      this.parseContextStack.push({
         node: node,
         tagName: node.name,
         targetContainer: {
            body: body,
            categoryTree: {},
            inCatalog: true,
         },
         depth: ++context.depth
      });
   },

   endParseCompound: function(tagName)
   {
      let selfContext = this.popParseContext();
      let parentContext = this.getParseContext();
      let targetContainer = selfContext.targetContainer;
      let body = targetContainer.body;
      body += "</div>";
      parentContext.targetContainer.body = body;
      parentContext.targetContainer.categoryTree = targetContainer.categoryTree
      return true;
   },

   /// 透传
   beginParseCompact_paragraph: function(node)
   {
      let context = this.getParseContext();
      let attrs = node.attributes;
      let targetContainer = context.targetContainer;
      let body = targetContainer.body;
      if (_.has(attrs, 'toctree')) {
         let classes = '';
         if (!_.isEmpty(attrs.classes)) {
            classes = 'class = "' + attrs.classes + '"';
         }
      }
      this.parseContextStack.push({
         node: node,
         tagName: node.name,
         targetContainer: {
            body: body,
            inCatalog: targetContainer.inCatalog,
            categoryTree: targetContainer.categoryTree,
         },
         depth: ++context.depth
      });
   },

   endParseCompact_paragraph: function(node)
   {  
      let selfContext = this.popParseContext();
      let parentContext = this.getParseContext();
      let targetContainer = selfContext.targetContainer;
      let body = targetContainer.body;
      parentContext.targetContainer.body = body;
      parentContext.targetContainer.categoryTree = targetContainer.categoryTree;
      return true;
   },

   beginParseTitle : function(node)
   {
      let context = this.getParseContext();
      let attrs = context.node.attributes;
      let targetContainer = context.targetContainer;
      let body = targetContainer.body;
      if (_.has(attrs, 'toctree')) {
         body += '<p class = "caption-text">';
      } else {
         body += '<p>';
      }

      this.parseContextStack.push({
         node: node,
         tagName: node.name,
         targetContainer: {
            body: body
         },
         depth: ++context.depth
      });

   },

   notifyTitleText: function (text)
   {
      let context = this.getParseContext();
      context.targetContainer.body += text;
      return true;
   },

   endParseTitle : function(node)
   {
      let selfContext = this.popParseContext();
      let parentContext = this.getParseContext();
      let targetContainer = selfContext.targetContainer;
      let body = targetContainer.body;
      body += "</p>";
      parentContext.targetContainer.body = body;
   
      return true;
   },

   beginParseBullet_list : function(node) 
   {
      let context = this.getParseContext();
      let attrs = node.attributes;
      let targetContainer = context.targetContainer;
      let body = targetContainer.body;
      let categoryTree;
      if (targetContainer.inCatalog) {
         if (_.has(context.node.attributes, 'toctree')) {
            targetContainer.categoryTree = categoryTree = [];
         } else {
            categoryTree = [];
            targetContainer.categoryTree.push(categoryTree);
         }
      }
      
      body += '<ul>'

      this.parseContextStack.push({
         node: node,
         tagName: node.name,
         targetContainer: {
            body: body,
            categoryTree: categoryTree,
            inCatalog: targetContainer.inCatalog,
         },
         depth: ++context.depth
      });
   },

   endParseBullet_list : function(node)
   {
      let selfContext = this.popParseContext();
      let parentContext = this.getParseContext();
      let targetContainer = selfContext.targetContainer;
      let body = targetContainer.body;
      body += '</ul>'
      if (_.has(parentContext.node.attributes, 'toctree')) {
         parentContext.targetContainer.categoryTree = targetContainer.categoryTree
      }
      parentContext.targetContainer.body = body;
      return true;
   },

   beginParseList_item : function(node) 
   {
      let context = this.getParseContext();
      let attrs = node.attributes;
      let targetContainer = context.targetContainer;
      let body = targetContainer.body;

      let classes = '';
      if (!_.isEmpty(attrs.classes)) {
         classes = 'class = "' + attrs.classes + '"';
      }

      body += `<li ${classes}>`;

      this.parseContextStack.push({
         node: node,
         tagName: node.name,
         targetContainer: {
            body: body,
            categoryTree: targetContainer.categoryTree,
            inCatalog: targetContainer.inCatalog,
         },
         depth: ++context.depth
      });
   },

   endParseList_item : function(node)
   {
      let selfContext = this.popParseContext();
      let parentContext = this.getParseContext();
      let targetContainer = selfContext.targetContainer;
      let body = targetContainer.body;
      body += '</li>'
      parentContext.targetContainer.body = body;
      return true;
   },

   beginParseReference : function(node) 
   {
      let context = this.getParseContext();
      let attrs = node.attributes;
      let targetContainer = context.targetContainer;
      let body = targetContainer.body;

      let href = "";
      if (attrs.internal == "True") {
         if (!_.isEmpty(attrs.refuri) && -1 != attrs.refuri.indexOf('#')) {
            let url = _.replace(attrs.refuri, '#', '.html#');
            href = `docs/${url}`;
         } else if (!_.isEmpty(attrs.refid)) {
            href = `#${attrs.refuri}`;
         } else {
            href = `docs/${attrs.refuri}.html`;
         }
      } else {
         href = attrs.refuri+'.html';
      }
      body += `<a href = "${href}">`;
      let catalogItem = {};
      if (targetContainer.inCatalog) {
         catalogItem.url = href;
         catalogItem.internal = attrs.internal == "True" ? true : false;
         catalogItem.anchorname = attrs.anchorname;
         catalogItem.refuri = attrs.refuri;
      }
      this.parseContextStack.push({
         node: node,
         tagName: node.name,
         targetContainer: {
            body: body,
            categoryTree: targetContainer.categoryTree,
            catalogItem: catalogItem,
            inCatalog: targetContainer.inCatalog
         },
         depth: ++context.depth
      });
   },

   endParseReference : function(node)
   {
      let selfContext = this.popParseContext();
      let parentContext = this.getParseContext();
      let targetContainer = selfContext.targetContainer;
      let body = targetContainer.body;
      if (selfContext.targetContainer.inCatalog) {
         targetContainer.categoryTree.push(targetContainer.catalogItem);
      }
      body += '</a>'
      parentContext.targetContainer.body = body;
      parentContext.targetContainer.categoryTree = targetContainer.categoryTree;
      return true;
   },
   
   notifyReferenceText: function (text)
   {
      let context = this.getParseContext();
      context.targetContainer.body += text;
      if (context.targetContainer.inCatalog) {
         context.targetContainer.catalogItem.text = text;
      }
      return true;
   },

   beginParseFigure: function(node)
   {
      let context = this.getParseContext();
      let attrs = node.attributes;
      let targetContainer = context.targetContainer;
      let body = targetContainer.body;

      let classes = "";
      if (!_.isEmpty(attrs.align)) {
         classes = `class = "aligin-${attrs.align}"`;
      }

      body += `<figure ${classes}>`

      this.parseContextStack.push({
         node: node,
         tagName: node.name,
         targetContainer: {
            body: body
         },
         depth: ++context.depth
      });
   },

   endParseFigure: function(node)
   {
      let selfContext = this.popParseContext();
      let parentContext = this.getParseContext();
      let targetContainer = selfContext.targetContainer;
      let body = targetContainer.body;
      body += '</figure>'
      parentContext.targetContainer.body = body;
      return true;
   },

   beginParseImage: function(node)
   {
      let context = this.getParseContext();
      let attrs = node.attributes;
      let targetContainer = context.targetContainer;
      let body = targetContainer.body;

      let alt = "";
      let src = "";
      let style = "";
      let styleParts = [];
      if (!_.isEmpty(attrs.alt)) {
         alt = `alt = "${attrs.alt}"`;
      }
      if (!_.isEmpty(attrs.uri)) {
         src = `src = "${attrs.uri}"`;
      }

      if (!_.isEmpty(attrs.height)) {
         styleParts.push(`height: ${attrs.height};`);
      }
      if (!_.isEmpty(attrs.width)) {
         styleParts.push(`width: ${attrs.width};`);
      }
      if (styleParts.length != 0) {
         style = `style = "${styleParts.join('')}"`;
      }

      body += `<img ${alt} ${src} ${style}>`

      this.parseContextStack.push({
         node: node,
         tagName: node.name,
         targetContainer: {
            body: body
         },
         depth: ++context.depth
      });
   },

   endParseImage: function(node)
   {
      let selfContext = this.popParseContext();
      let parentContext = this.getParseContext();
      let targetContainer = selfContext.targetContainer;
      let body = targetContainer.body;
      body += '</img>'
      parentContext.targetContainer.body = body;
      return true;
   },

   beginParseLine_block: function(node)
   {
      let context = this.getParseContext();
      let attrs = node.attributes;
      let targetContainer = context.targetContainer;
      let body = targetContainer.body;

      body += `<div class = "line-block">`

      this.parseContextStack.push({
         node: node,
         tagName: node.name,
         targetContainer: {
            body: body
         },
         depth: ++context.depth
      });
   },

   endParseLine_block: function(node)
   {
      let selfContext = this.popParseContext();
      let parentContext = this.getParseContext();
      let targetContainer = selfContext.targetContainer;
      let body = targetContainer.body;
      body += '</div>'
      parentContext.targetContainer.body = body;
      return true;
   },

   beginParseLine: function(node)
   {
      let context = this.getParseContext();
      let attrs = node.attributes;
      let targetContainer = context.targetContainer;
      let body = targetContainer.body;

      body += `<div class = "line">`

      this.parseContextStack.push({
         node: node,
         tagName: node.name,
         targetContainer: {
            body: body
         },
         depth: ++context.depth
      });
   },

   notifyLineText: function (text)
   {
      
      let context = this.getParseContext();
      context.targetContainer.body += text;
      return true;
   },

   endParseLine: function(node)
   {
      let selfContext = this.popParseContext();
      let parentContext = this.getParseContext();
      let targetContainer = selfContext.targetContainer;
      let body = targetContainer.body;
      body += '</div>'
      parentContext.targetContainer.body = body;
      return true;
   },

   beginParseStrong: function(node)
   {
      let context = this.getParseContext();
      let attrs = node.attributes;
      let targetContainer = context.targetContainer;
      let body = targetContainer.body;

      body += `<strong>`

      this.parseContextStack.push({
         node: node,
         tagName: node.name,
         targetContainer: {
            body: body
         },
         depth: ++context.depth
      });
   },

   notifyStrongText: function (text)
   {
      let context = this.getParseContext();
      context.targetContainer.body += text;
      return true;
   },

   endParseStrong: function(node)
   {
      let selfContext = this.popParseContext();
      let parentContext = this.getParseContext();
      let targetContainer = selfContext.targetContainer;
      let body = targetContainer.body;
      body += '</strong>'
      parentContext.targetContainer.body = body;
      return true;
   },

   beginParseField_list: function(node)
   {
      let context = this.getParseContext();
      let attrs = node.attributes;
      let targetContainer = context.targetContainer;
      let body = targetContainer.body;

      body += `<table class = "field-list">`

      this.parseContextStack.push({
         node: node,
         tagName: node.name,
         targetContainer: {
            body: body
         },
         depth: ++context.depth
      });
   },

   endParseField_list: function(node)
   {
      let selfContext = this.popParseContext();
      let parentContext = this.getParseContext();
      let targetContainer = selfContext.targetContainer;
      let body = targetContainer.body;
      body += '</table>'
      parentContext.targetContainer.body = body;
      return true;
   },

   beginParseField: function(node)
   {
      let context = this.getParseContext();
      let attrs = node.attributes;
      let targetContainer = context.targetContainer;
      let body = targetContainer.body;

      body += `<tr class = "field">`

      this.parseContextStack.push({
         node: node,
         tagName: node.name,
         targetContainer: {
            body: body
         },
         depth: ++context.depth
      });
   },

   endParseField: function(node)
   {
      let selfContext = this.popParseContext();
      let parentContext = this.getParseContext();
      let targetContainer = selfContext.targetContainer;
      let body = targetContainer.body;
      body += '</tr>'
      parentContext.targetContainer.body = body;
      return true;
   },

   beginParseField_name: function(node)
   {
      let context = this.getParseContext();
      let attrs = node.attributes;
      let targetContainer = context.targetContainer;
      let body = targetContainer.body;

      body += `<th class = "field-name">`

      this.parseContextStack.push({
         node: node,
         tagName: node.name,
         targetContainer: {
            body: body
         },
         depth: ++context.depth
      });
   },

   notifyField_nameText: function (text)
   {
      let context = this.getParseContext();
      context.targetContainer.body += text;
      return true;
   },

   endParseField_name: function(node)
   {
      let selfContext = this.popParseContext();
      let parentContext = this.getParseContext();
      let targetContainer = selfContext.targetContainer;
      let body = targetContainer.body;
      body += '</th>'
      parentContext.targetContainer.body = body;
      return true;
   },

   beginParseField_body: function(node)
   {
      let context = this.getParseContext();
      let attrs = node.attributes;
      let targetContainer = context.targetContainer;
      let body = targetContainer.body;

      body += `<td class = "field-body">`

      this.parseContextStack.push({
         node: node,
         tagName: node.name,
         targetContainer: {
            body: body
         },
         depth: ++context.depth
      });
   },

   notifyField_bodyText: function (text)
   {
      let context = this.getParseContext();
      context.targetContainer.body += text;
      return true;
   },


   endParseField_body: function(node)
   {
      let selfContext = this.popParseContext();
      let parentContext = this.getParseContext();
      let targetContainer = selfContext.targetContainer;
      let body = targetContainer.body;
      body += '</td>'
      parentContext.targetContainer.body = body;
      return true;
   },

   beginParseParagraph: function(node)
   {
      let context = this.getParseContext();
      let attrs = node.attributes;
      let targetContainer = context.targetContainer;
      let body = targetContainer.body;

      body += `<p>`

      this.parseContextStack.push({
         node: node,
         tagName: node.name,
         targetContainer: {
            body: body
         },
         depth: ++context.depth
      });
   },

   notifyParagraphText: function (text)
   {
      let context = this.getParseContext();
      context.targetContainer.body += text;
      return true;
   },

   endParseParagraph: function(node)
   {
      let selfContext = this.popParseContext();
      let parentContext = this.getParseContext();
      let targetContainer = selfContext.targetContainer;
      let body = targetContainer.body;
      body += '</p>'
      parentContext.targetContainer.body = body;
      return true;
   },

   beginParseTable: function(node)
   {
      let context = this.getParseContext();
      let attrs = node.attributes;
      let targetContainer = context.targetContainer;
      let body = targetContainer.body;
      let classes = "";
      if (!_.isEmpty(attrs.classes)) {
         classes = `class = "${attrs.classes}"`;
      }
      body += `<table ${classes}>`

      this.parseContextStack.push({
         node: node,
         tagName: node.name,
         targetContainer: {
            body: body
         },
         depth: ++context.depth
      });
   },

   endParseTable: function(node)
   {
      let selfContext = this.popParseContext();
      let parentContext = this.getParseContext();
      let targetContainer = selfContext.targetContainer;
      let body = targetContainer.body;
      body += '</table>'
      parentContext.targetContainer.body = body;
      return true;
   },

   beginParseTgroup: function(node)
   {
      let context = this.getParseContext();
      let attrs = node.attributes;
      let targetContainer = context.targetContainer;
      let body = targetContainer.body;
      let counter = this.hexo.counter;
      let tag = `<colgroup>${counter}`;
      body += tag;

      this.parseContextStack.push({
         node: node,
         tagName: node.name,
         targetContainer: {
            body: body,
            colSpecs: [],
            tag: tag
         },
         depth: ++context.depth
      });
   },

   endParseTgroup: function(node)
   {
      let selfContext = this.popParseContext();
      let parentContext = this.getParseContext();
      let targetContainer = selfContext.targetContainer;
      let body = targetContainer.body;
      if (targetContainer.colSpecs.length > 0) {
         body = _.replace(body, targetContainer.tag, `<colgroup>${targetContainer.colSpecs.join('')}</colgroup>`);
      } else {
         body = _.replace(body, targetContainer.tag, '<colgroup></colgroup>');
      }
      
      parentContext.targetContainer.body = body;
      return true;
   },

   beginParseColspec: function(node)
   {
      let context = this.getParseContext();
      let attrs = node.attributes;
      let targetContainer = context.targetContainer;
      let body = targetContainer.body;

      let style = "";

      if (!_.isEmpty(attrs.colwidth)) {
         style = `style = "width:${attrs.colwidth}%"`;
      }
      targetContainer.colSpecs.push(`<col ${style}/>`);
      this.parseContextStack.push({
         node: node,
         tagName: node.name,
         targetContainer: {
            body: body
         },
         depth: ++context.depth
      });
   },

   endParseColspec: function(node)
   {
      let selfContext = this.popParseContext();
      let parentContext = this.getParseContext();
      let targetContainer = selfContext.targetContainer;
      let body = targetContainer.body;
      parentContext.targetContainer.body = body;
      return true;
   },

   beginParseThead: function(node)
   {
      let context = this.getParseContext();
      let attrs = node.attributes;
      let targetContainer = context.targetContainer;
      let body = targetContainer.body;
      body += `<thead>`

      this.parseContextStack.push({
         node: node,
         tagName: node.name,
         targetContainer: {
            body: body,
            thead: true
         },
         depth: ++context.depth
      });
   },

   endParseThead: function(node)
   {
      let selfContext = this.popParseContext();
      let parentContext = this.getParseContext();
      let targetContainer = selfContext.targetContainer;
      let body = targetContainer.body;
      body += '</thead>'
      parentContext.targetContainer.body = body;
      return true;
   },

   beginParseTbody: function(node)
   {
      let context = this.getParseContext();
      let attrs = node.attributes;
      let targetContainer = context.targetContainer;
      let body = targetContainer.body;
      body += `<tbody>`

      this.parseContextStack.push({
         node: node,
         tagName: node.name,
         targetContainer: {
            body: body,
            tbody: true
         },
         depth: ++context.depth
      });
   },

   endParseTbody: function(node)
   {
      let selfContext = this.popParseContext();
      let parentContext = this.getParseContext();
      let targetContainer = selfContext.targetContainer;
      let body = targetContainer.body;
      body += '</tbody>'
      parentContext.targetContainer.body = body;
      return true;
   },
   
   beginParseRow: function(node)
   {
      let context = this.getParseContext();
      let attrs = node.attributes;
      let targetContainer = context.targetContainer;
      let body = targetContainer.body;

      body += `<tr>`

      this.parseContextStack.push({
         node: node,
         tagName: node.name,
         targetContainer: {
            body: body,
            thead: targetContainer.thead,
            tbody: targetContainer.tbody,
         },
         depth: ++context.depth
      });
   },

   endParseRow: function(node)
   {
      let selfContext = this.popParseContext();
      let parentContext = this.getParseContext();
      let targetContainer = selfContext.targetContainer;
      let body = targetContainer.body;
      body += '</tr>'
      parentContext.targetContainer.body = body;
      return true;
   },

   beginParseEntry: function(node)
   {
      let context = this.getParseContext();
      let attrs = node.attributes;
      let targetContainer = context.targetContainer;
      let body = targetContainer.body;
      if (targetContainer.thead) {
         body += `<th>`
      } else {
         body += `<td>`
      }

      this.parseContextStack.push({
         node: node,
         tagName: node.name,
         targetContainer: {
            body: body
         },
         depth: ++context.depth
      });
   },

   endParseEntry: function(node)
   {
      let selfContext = this.popParseContext();
      let parentContext = this.getParseContext();
      let targetContainer = selfContext.targetContainer;
      let body = targetContainer.body;
      if (parentContext.targetContainer.thead) {
         body += '</th>'
      } else {
         body += '</td>'
      }
      parentContext.targetContainer.body = body;
      return true;
   },
};


module.exports = Parser;