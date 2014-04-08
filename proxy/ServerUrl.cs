using System.Xml.Serialization;
public class ServerUrl {
    string url;
    bool matchAll;
    string oauth2Endpoint;
    string username;
    string password;
    string clientId;
    string clientSecret;
    string accessToken;
    string tokenParamName;
    string rateLimit;
    string rateLimitPeriod;
    
    [XmlAttribute("url")]
    public string Url {
        get { return url; }
        set { url = value; }
    }
    [XmlAttribute("matchAll")]
    public bool MatchAll {
        get { return matchAll; }
        set { matchAll = value; }
    }
    [XmlAttribute("oauth2Endpoint")]
    public string OAuth2Endpoint {
        get { return oauth2Endpoint; }
        set { oauth2Endpoint = value; }
    }
    [XmlAttribute("username")]
    public string Username {
        get { return username; }
        set { username = value; }
    }
    [XmlAttribute("password")]
    public string Password {
        get { return password; }
        set { password = value; }
    }
    [XmlAttribute("clientId")]
    public string ClientId {
        get { return clientId; }
        set { clientId = value; }
    }
    [XmlAttribute("clientSecret")]
    public string ClientSecret {
        get { return clientSecret; }
        set { clientSecret = value; }
    }
    [XmlAttribute("accessToken")]
    public string AccessToken {
        get { return accessToken; }
        set { accessToken = value; }
    }
    [XmlAttribute("tokenParamName")]
    public string TokenParamName {
        get { return tokenParamName; }
        set { tokenParamName = value; }
    }
    [XmlAttribute("rateLimit")]
    public int RateLimit {
        get { return string.IsNullOrEmpty(rateLimit)? -1 : int.Parse(rateLimit); }
        set { rateLimit = value.ToString(); }
    }
    [XmlAttribute("rateLimitPeriod")]
    public int RateLimitPeriod {
        get { return string.IsNullOrEmpty(rateLimitPeriod)? 60 : int.Parse(rateLimitPeriod); }
        set { rateLimitPeriod = value.ToString(); }
    }
}