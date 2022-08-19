module.exports = function (hexo)
{
   hexo.extend.helper.register("url_for_api_entity", function(refid)
   {
      let basePath = hexo.config.apidoc_path || "api";
      let url_for = hexo.extend.helper.get('url_for');
      if (refid[0] == "_" ) {
         refid = "file"+refid;
      }
      return url_for.call(hexo, basePath + "/" + refid + ".html");
   });

   hexo.extend.helper.register("url_for_entity_detail", function(containerId, id)
   {
      let basePath = hexo.config.apidoc_path || "api";
      let url_for = hexo.extend.helper.get('url_for');
      if (containerId[0] == "_" ) {
         containerId = "file"+containerId;
      }
      return url_for.call(hexo, basePath + "/"+containerId+".html#"+id);
   });
};