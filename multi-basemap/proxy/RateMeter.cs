namespace Esri.Proxy
{
	using System;

	class RateMeter
	{
		double _rate; //internal rate is stored in requests per second
		int _countCap;
		double _count = 0;
		DateTime _lastUpdate = DateTime.Now;

		public RateMeter(int rate_limit, int rate_limit_period)
		{
			_rate = (double)rate_limit / rate_limit_period / 60;
			_countCap = rate_limit;
		}

		//called when rate-limited endpoint is invoked
		public bool click()
		{
			TimeSpan ts = DateTime.Now - _lastUpdate;
			_lastUpdate = DateTime.Now;
			//assuming uniform distribution of requests over time,
			//reducing the counter according to # of seconds passed
			//since last invocation
			_count = Math.Max(0, _count - ts.TotalSeconds * _rate);
			if (_count <= _countCap)
			{
				//good to proceed
				_count++;
				return true;
			}
			return false;
		}

		public bool canBeCleaned()
		{
			TimeSpan ts = DateTime.Now - _lastUpdate;
			return _count - ts.TotalSeconds * _rate <= 0;
		}
	}


}