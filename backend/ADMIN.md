# Usimamizi wa Vifani Jamii

Fungua `/admin` kwenye anwani ya backend. Tumia HTTPS kwenye seva ya umma. Weka `SAAS_ADMIN_USERNAME` na `SAAS_ADMIN_PASSWORD_HASH` kwenye mazingira ya backend au kwenye Render. Thamani ya pili ni hash ya bcrypt ya nenosiri imara ulilochagua. Akaunti hii ni tofauti na akaunti za wanachama.

Kutengeneza hash kwa PowerShell ukiwa kwenye folda ya backend:

~~~powershell
$vifaniAdminSecret = Read-Host "Nenosiri la msimamizi" -AsSecureString
$env:VIFANI_SETUP_PASSWORD = [pscredential]::new('admin', $vifaniAdminSecret).GetNetworkCredential().Password
try {
  node -e "require('bcryptjs').hash(process.env.VIFANI_SETUP_PASSWORD, 12).then(console.log)"
} finally {
  Remove-Item Env:VIFANI_SETUP_PASSWORD
}
~~~

Nakili hash iliyotolewa kwenda SAAS_ADMIN_PASSWORD_HASH.

Msimamizi anathibitisha malipo yaliyopokelewa kwa rejea ya kipekee. Kila mwezi ni TZS 10,000. Mfumo huongeza muda baada ya tarehe ya mwisho iliyopo au kuanzia leo kama muda umeisha. Vikundi vilivyosimamishwa au vilivyoishiwa muda vina ufikiaji wa kusoma taarifa. Kurejesha kikundi hakubadili tarehe ya malipo.

Kwa jaribio la ndani tumia hifadhidata ya majaribio. Migration `20261124120000_subscription_and_membership` inaongeza tarehe ya malipo, historia ya malipo na taarifa za kusimamisha uanachama. Tumia mpangilio wa deployment wa mradi kusasisha hifadhidata kabla ya kuanzisha backend mpya.
