import requestsimport jsonimport osimport pandas as pdfrom BLS_dict import thisdictfrom datetime import datetimeos.chdir(r'/Users/yiyanzhang/Downloads/jolts')bls_api_key = '260a27d7c29b45a3909538fdca9970b2'def chunks(lst, n):    """Yield successive n-sized chunks from lst."""    for i in range(0, len(lst), n):        yield lst[i:i + n]series_all = list(thisdict.keys())series_list = list(chunks(series_all, 50))col = ["series id", "Series name", "year", "period", "value"]df_all = pd.DataFrame(columns=col)headers = {'Content-type': 'application/json'}for series in series_list:    data = json.dumps({"seriesid": series, 'registrationkey': bls_api_key                          , "startyear": str(datetime.today().year - 19), "endyear": str(datetime.today().year)})    p = requests.post('https://api.bls.gov/publicAPI/v2/timeseries/data/', data=data, headers=headers)    json_data = json.loads(p.text)    for series in json_data['Results']['series']:        df = pd.DataFrame(columns=col)        seriesId = series['seriesID']        series_name = thisdict[seriesId]        for item in series['data']:            year = item['year']            period = item['period']            value = item['value']            if 'M01' <= period <= 'M12':                df = df.append(pd.Series([series['seriesID'], series_name, item['year'], item['period'], item['value']],                                         index=col), ignore_index=True)        df['month'] = (df["period"].str[1:]).astype(int)        df['year'] = df['year'].astype(int)        df['day'] = 1        df.drop_duplicates(inplace=True)        df["Date"] = pd.to_datetime(df[['month', 'year', 'day']], format="%d/%m/%Y")        # Appending all series in one dataframe        df_all = df_all.append(df, ignore_index=True)        df.drop(labels=['day', 'month', 'period', 'year'], inplace=True, axis=1)        # df.to_csv(thisdict[seriesId]+'.csv',index=None)df_all.drop(labels=['day', 'month', 'period', 'year'], inplace=True, axis=1)df_all['value'] = df_all['value'].astype(float)df_all.to_excel("df.xlsx", index=None)