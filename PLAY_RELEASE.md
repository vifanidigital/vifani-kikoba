# Maandalizi ya Google Play

- Profaili ya production ya Expo Build inatengeneza Android App Bundle na kuongeza versionCode. Expo SDK 58 inalenga API 36. Hakiki manifest ya AAB iliyosainiwa kabla ya kuipakia.
- Andaa Privacy Policy ya umma kwa taarifa zinazokusanywa, matumizi, kushiriki data, muda wa kuhifadhi, mawasiliano na utaratibu wa kufuta data. Jaza Data safety kwa matumizi halisi.
- Njia ya kuanzisha ombi iko kwenye Mipangilio ya akaunti na kwenye https://vifani-kikoba.onrender.com/account-deletion. Orodha ya maombi inapatikana kwa admin kupitia /admin/account-deletion-requests. Kabla ya uzinduzi, mteue msimamizi wa kushughulikia maombi, thibitisha sera ya kuhifadhi kumbukumbu za fedha na hakiki mchakato mzima wa kufuta data.
- Jaza Financial features declaration. Kagua uainishaji wa mikopo ya kikundi na masharti ya Papo. Google Play ina masharti maalum kwa mikopo binafsi, ikiwemo kutokuwa na sharti la marejesho kamili ndani ya siku 60 au chini. Hakiki masharti, vibali na maelezo ya duka kabla ya kuwasilisha toleo.
- Kagua saini na akaunti ya EAS/Play Console, ruhusa za Android, majaribio ya ndani kwenye simu halisi na masharti ya majaribio ya aina ya akaunti ya Play Console.

## Usalama wa uzalishaji

- Weka JWT_SECRET ndefu ya bahati nasibu kwenye Render na tumia CORS_ALLOWED_ORIGINS kwa tovuti zilizoidhinishwa. App ya simu hutumia HTTPS.
- Tenganisha akaunti ya migration na akaunti yenye ruhusa chache za runtime kwenye PostgreSQL. Hakiki TLS, nakala za hifadhi zinazoweza kurejeshwa, mzunguko wa token na funguo, ufuatiliaji wa maombi yenye 429 na ukaguzi wa ruhusa za Render/Neon.
- Kikomo cha majaribio ya PIN cha API kinafanya kazi ndani ya mchakato mmoja. Kwa instances nyingi, tumia kikomo cha pamoja kwenye gateway au hifadhi ya pamoja na uhakiki usahihi wa trust proxy.
- Panga kubadili PIN za zamani ambazo zilitolewa kama PIN ya pamoja. Mfumo sasa unatengeneza PIN tofauti kwa viongozi wapya.
- Thibitisha maombi ya data na hatari za dependencies kwa kila release. Dhibiti muda wa kuhifadhi logi na nakala za data.
