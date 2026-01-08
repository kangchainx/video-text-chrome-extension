import React from 'react'
import { useTranslation } from 'react-i18next'
import { RocketLaunch, ShieldCheck, DownloadSimple, CheckCircle, Lightning, GithubLogo, GitBranch, Star } from 'phosphor-react'

const GITHUB_REPO_URL = 'https://github.com/kangchainx/video-text-chrome-extension'

const WelcomeApp: React.FC = () => {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-100 flex items-center justify-center p-6 font-sans antialiased text-slate-800">
      <div className="max-w-3xl w-full bg-white/90 backdrop-blur-xl rounded-[2rem] shadow-2xl shadow-indigo-200/50 p-12 border border-white/40 animate-fade-in-up">
        {/* Header with animated icon */}
        <header className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-tr from-indigo-600 to-violet-500 rounded-3xl shadow-lg shadow-indigo-300 mb-6 animate-bounce-gentle">
             <RocketLaunch size={40} weight="duotone" className="text-white animate-float" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight mb-4 bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600 animate-fade-in">
            {t('welcome.title')}
          </h1>
          <p className="text-slate-500 text-lg animate-fade-in-delay">{t('welcome.subtitle')}</p>
        </header>

        {/* Features Grid - 4 features with staggered animation */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
          <div className="feature-card p-6 rounded-2xl bg-gradient-to-br from-slate-50 to-white border border-slate-100 hover:shadow-xl hover:scale-105 transition-all duration-300 group animate-slide-in" style={{ animationDelay: '0.1s' }}>
             <div className="w-12 h-12 bg-gradient-to-br from-indigo-100 to-indigo-200 rounded-xl shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
                <ShieldCheck size={26} weight="duotone" className="text-indigo-600" />
             </div>
             <h3 className="text-lg font-bold mb-2">{t('welcome.features.privacy.title')}</h3>
             <p className="text-slate-500 text-sm leading-relaxed">{t('welcome.features.privacy.description')}</p>
          </div>

          <div className="feature-card p-6 rounded-2xl bg-gradient-to-br from-slate-50 to-white border border-slate-100 hover:shadow-xl hover:scale-105 transition-all duration-300 group animate-slide-in" style={{ animationDelay: '0.2s' }}>
             <div className="w-12 h-12 bg-gradient-to-br from-violet-100 to-violet-200 rounded-xl shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
                <DownloadSimple size={26} weight="duotone" className="text-violet-600" />
             </div>
             <h3 className="text-lg font-bold mb-2">{t('welcome.features.service.title')}</h3>
             <p className="text-slate-500 text-sm leading-relaxed">{t('welcome.features.service.description')}</p>
          </div>

          <div className="feature-card p-6 rounded-2xl bg-gradient-to-br from-slate-50 to-white border border-slate-100 hover:shadow-xl hover:scale-105 transition-all duration-300 group animate-slide-in" style={{ animationDelay: '0.3s' }}>
             <div className="w-12 h-12 bg-gradient-to-br from-emerald-100 to-emerald-200 rounded-xl shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
                <Lightning size={26} weight="duotone" className="text-emerald-600" />
             </div>
             <h3 className="text-lg font-bold mb-2">{t('welcome.features.fast.title')}</h3>
             <p className="text-slate-500 text-sm leading-relaxed">{t('welcome.features.fast.description')}</p>
          </div>

          <div className="feature-card p-6 rounded-2xl bg-gradient-to-br from-slate-50 to-white border border-slate-100 hover:shadow-xl hover:scale-105 transition-all duration-300 group animate-slide-in" style={{ animationDelay: '0.4s' }}>
             <div className="w-12 h-12 bg-gradient-to-br from-rose-100 to-rose-200 rounded-xl shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 group-hover:rotate-6 transition-all duration-300">
                <Star size={26} weight="duotone" className="text-rose-600" />
             </div>
             <h3 className="text-lg font-bold mb-2">{t('welcome.features.free.title')}</h3>
             <p className="text-slate-500 text-sm leading-relaxed">{t('welcome.features.free.description')}</p>
          </div>
        </div>

        {/* How to start section */}
        <section className="bg-gradient-to-br from-indigo-600 to-violet-600 rounded-3xl p-8 text-white relative overflow-hidden shadow-xl shadow-indigo-300 mb-8 animate-slide-in" style={{ animationDelay: '0.5s' }}>
           <div className="relative z-10">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <CheckCircle size={24} weight="fill" />
                {t('welcome.howToStart.title')}
              </h2>
              <ul className="space-y-3 text-white/95">
                {(t('welcome.howToStart.steps', { returnObjects: true }) as string[]).map((step, index) => (
                  <li key={index} className="flex items-start gap-3 animate-fade-in" style={{ animationDelay: `${0.6 + index * 0.1}s` }}>
                    <span className="bg-white/25 backdrop-blur-sm rounded-full px-2.5 py-1 text-xs font-bold leading-none mt-0.5 shadow-sm">
                      {index + 1}
                    </span>
                    <span className="flex-1">{step}</span>
                  </li>
                ))}
              </ul>
           </div>
           {/* Animated decorative elements */}
           <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-white/10 rounded-full blur-3xl animate-pulse-gentle"></div>
           <div className="absolute -right-4 -top-4 w-24 h-24 bg-indigo-400/20 rounded-full blur-2xl animate-pulse-gentle" style={{ animationDelay: '1s' }}></div>
           <div className="absolute left-8 top-8 w-16 h-16 bg-violet-300/20 rounded-full blur-xl animate-pulse-gentle" style={{ animationDelay: '2s' }}></div>
        </section>

        {/* GitHub section */}
        <section className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-6 text-white mb-8 border border-slate-700 animate-slide-in" style={{ animationDelay: '0.6s' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <GithubLogo size={24} weight="fill" />
              {t('welcome.support.title')}
            </h3>
          </div>
          <p className="text-slate-300 text-sm mb-4">
            {t('welcome.support.star')} {/* Adding cute message */}
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white text-slate-900 rounded-xl font-semibold text-sm hover:bg-slate-100 transition-all duration-200 hover:scale-105 shadow-sm"
            >
              <GithubLogo size={18} weight="fill" />
              {t('welcome.support.github')}
            </a>
            <a
              href={`${GITHUB_REPO_URL}/issues`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-xl font-semibold text-sm hover:bg-slate-600 transition-all duration-200 hover:scale-105 border border-slate-600"
            >
              <GitBranch size={18} />
              {t('welcome.support.issues')}
            </a>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-8 text-center text-slate-400 text-sm animate-fade-in" style={{ animationDelay: '0.7s' }}>
           {t('welcome.footer')}
        </footer>
      </div>

      {/* Add custom animations to index.css */}
      <style>{`
        @keyframes fade-in-up {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slide-in {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes bounce-gentle {
          0%, 100% {
            transform: translateY(0) rotate(3deg);
          }
          50% {
            transform: translateY(-10px) rotate(3deg);
          }
        }

        @keyframes float {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-5px);
          }
        }

        @keyframes pulse-gentle {
          0%, 100% {
            opacity: 0.3;
          }
          50% {
            opacity: 0.6;
          }
        }

        .animate-fade-in-up {
          animation: fade-in-up 0.6s ease-out;
        }

        .animate-fade-in {
          animation: fade-in 0.8s ease-out;
        }

        .animate-fade-in-delay {
          animation: fade-in 0.8s ease-out 0.2s backwards;
        }

        .animate-slide-in {
          animation: slide-in 0.6s ease-out backwards;
        }

        .animate-bounce-gentle {
          animation: bounce-gentle 3s ease-in-out infinite;
        }

        .animate-float {
          animation: float 2s ease-in-out infinite;
        }

        .animate-pulse-gentle {
          animation: pulse-gentle 4s ease-in-out infinite;
        }

        .feature-card {
          backdrop-filter: blur(10px);
        }
      `}</style>
    </div>
  )
}

export default WelcomeApp
