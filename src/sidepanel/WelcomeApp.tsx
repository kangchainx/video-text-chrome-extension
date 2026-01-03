import React from 'react'
import { useTranslation } from 'react-i18next'
import { RocketLaunch, ShieldCheck, DownloadSimple, CheckCircle } from 'phosphor-react'

const WelcomeApp: React.FC = () => {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen bg-linear-to-br from-indigo-50 via-white to-slate-100 flex items-center justify-center p-6 font-sans antialiased text-slate-800">
      <div className="max-w-2xl w-full bg-white/80 backdrop-blur-xl rounded-4xl shadow-2xl shadow-indigo-200/50 p-12 border border-white/20">
        <header className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-linear-to-tr from-indigo-600 to-violet-500 rounded-3xl shadow-lg shadow-indigo-200 mb-6 rotate-3">
             <RocketLaunch size={40} weight="duotone" className="text-white" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight mb-4 bg-clip-text text-transparent bg-linear-to-r from-indigo-600 to-violet-600">
            {t('welcome.title')}
          </h1>
          <p className="text-slate-500 text-lg">{t('welcome.subtitle')}</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
          <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 hover:shadow-lg transition-all duration-300 group">
             <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <ShieldCheck size={28} className="text-indigo-600" />
             </div>
             <h3 className="text-lg font-bold mb-2">{t('welcome.features.privacy.title')}</h3>
             <p className="text-slate-500 text-sm leading-relaxed">{t('welcome.features.privacy.description')}</p>
          </div>

          <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 hover:shadow-lg transition-all duration-300 group">
             <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <DownloadSimple size={28} className="text-violet-600" />
             </div>
             <h3 className="text-lg font-bold mb-2">{t('welcome.features.service.title')}</h3>
             <p className="text-slate-500 text-sm leading-relaxed">{t('welcome.features.service.description')}</p>
          </div>
        </div>

        <section className="bg-indigo-600 rounded-4xl p-8 text-white relative overflow-hidden shadow-xl shadow-indigo-300">
           <div className="relative z-10">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <CheckCircle size={24} />
                {t('welcome.howToStart.title')}
              </h2>
              <ul className="space-y-3 text-indigo-50">
                {(t('welcome.howToStart.steps', { returnObjects: true }) as string[]).map((step, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="bg-white/20 rounded-full px-2 py-0.5 text-xs font-bold leading-none mt-1">{index + 1}</span>
                    {step}
                  </li>
                ))}
              </ul>
           </div>
           {/* Decorative circles */}
           <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-white/10 rounded-full blur-3xl"></div>
           <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-400/20 rounded-full blur-2xl"></div>
        </section>

        <footer className="mt-12 text-center text-slate-400 text-sm">
           {t('welcome.footer')}
        </footer>
      </div>
    </div>
  )
}

export default WelcomeApp
