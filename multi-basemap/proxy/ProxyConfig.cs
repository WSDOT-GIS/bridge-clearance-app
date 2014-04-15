namespace Esri.Proxy
{
	using System;
	using System.Web;
	using System.Web.Caching;
	using System.Xml.Serialization;

	[XmlRoot("ProxyConfig")]
	public class ProxyConfig
	{
		private static object _lockobject = new object();
		public static ProxyConfig LoadProxyConfig(string fileName)
		{
			ProxyConfig config = null;
			lock (_lockobject)
			{
				if (System.IO.File.Exists(fileName))
				{
					XmlSerializer reader = new XmlSerializer(typeof(ProxyConfig));
					using (System.IO.StreamReader file = new System.IO.StreamReader(fileName))
					{
						try
						{
							config = (ProxyConfig)reader.Deserialize(file);
						}
						catch (Exception ex)
						{
							throw ex;
						}
					}
				}
			}
			return config;
		}

		public static ProxyConfig GetCurrentConfig()
		{
			ProxyConfig config = HttpRuntime.Cache["proxyConfig"] as ProxyConfig;
			if (config == null)
			{
				string fileName = HttpContext.Current.Server.MapPath("proxy.config");
				config = LoadProxyConfig(fileName);
				if (config != null)
				{
					CacheDependency dep = new CacheDependency(fileName);
					HttpRuntime.Cache.Insert("proxyConfig", config, dep);
				}
			}
			return config;
		}

		//referer
		//create an array with valid referers using the allowedReferers String that is defined in the proxy.config
		public static String[] GetAllowedReferersArray()
		{
			if (allowedReferers == null)
				return null;

			return allowedReferers.Split(',');
		}

		//referer
		//check if URL starts with prefix...
		public static bool isUrlPrefixMatch(String prefix, String uri)
		{

			return uri.ToLower().StartsWith(prefix.ToLower()) ||
						uri.ToLower().Replace("https://", "http://").StartsWith(prefix.ToLower()) ||
						uri.ToLower().Substring(uri.IndexOf("//")).StartsWith(prefix.ToLower());
		}

		ServerUrl[] serverUrls;
		bool mustMatch;
		//referer
		static String allowedReferers;

		[XmlArray("serverUrls")]
		[XmlArrayItem("serverUrl")]
		public ServerUrl[] ServerUrls
		{
			get { return this.serverUrls; }
			set
			{
				this.serverUrls = value;
			}
		}
		[XmlAttribute("mustMatch")]
		public bool MustMatch
		{
			get { return mustMatch; }
			set
			{ mustMatch = value; }
		}

		//referer
		[XmlAttribute("allowedReferers")]
		public string AllowedReferers
		{
			get { return allowedReferers; }
			set
			{
				allowedReferers = value;
			}
		}

		public ServerUrl GetConfigServerUrl(string uri)
		{
			//split both request and proxy.config urls and compare them
			string[] uriParts = uri.Split(new char[] { '/', '?' }, StringSplitOptions.RemoveEmptyEntries);
			string[] configUriParts = new string[] { };

			foreach (ServerUrl su in serverUrls)
			{
				//if a relative path is specified in the proxy.config, append what's in the request itself
				if (!su.Url.StartsWith("http"))
					su.Url = su.Url.Insert(0, uriParts[0]);

				configUriParts = su.Url.Split(new char[] { '/', '?' }, StringSplitOptions.RemoveEmptyEntries);

				//if the request has less parts than the config, don't allow
				if (configUriParts.Length > uriParts.Length) continue;

				int i = 0;
				for (i = 0; i < configUriParts.Length; i++)
				{

					if (!configUriParts[i].ToLower().Equals(uriParts[i].ToLower())) break;
				}
				if (i == configUriParts.Length)
				{
					//if the urls don't match exactly, and the individual matchAll tag is 'false', don't allow
					if (configUriParts.Length == uriParts.Length || su.MatchAll)
						return su;
				}
			}

			if (mustMatch)
				throw new ArgumentException("Proxy is being used for an unsupported service:");

			return null;
		}


	} 
}