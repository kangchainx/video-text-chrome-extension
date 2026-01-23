import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { WarningCircle, Copy, Check, Download, X } from 'phosphor-react'
import { UpdateInfo } from '../services/updateChecker'

interface UpdateBadgeProps {
  updateInfo: UpdateInfo
  onDismiss: () => void
}

/**
 * 更新提示 Badge 组件
 * 显示在侧边栏顶部，悬停展开详情
 */
const UpdateBadge: React.FC<UpdateBadgeProps> = ({ updateInfo, onDismiss }) => {
  const { t } = useTranslation()
  const [showTooltip, setShowTooltip] = useState(false)
  const [copied, setCopied] = useState(false)

  // 检测平台
  const platform = navigator.platform.toLowerCase().includes('mac') ? 'macOS' : 'Windows'

  // 安装命令
  const installCommand = platform === 'macOS'
    ? `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/kangchainx/video-text-chrome-extension/main/native-host/install_mac.sh)"`
    : 'Download and run install_win.ps1';

  // 复制命令到剪贴板
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(installCommand)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  // 下载安装脚本
  const handleDownload = () => {
    const downloadUrl = platform === 'macOS'
      ? 'https://github.com/kangchainx/video-text-chrome-extension/releases/latest/download/install_mac.sh'
      : 'https://github.com/kangchainx/video-text-chrome-extension/releases/latest/download/install_win.ps1';
    
    chrome.downloads.download({
      url: downloadUrl,
      filename: platform === 'macOS' ? 'install_mac.sh' : 'install_win.ps1',
      saveAs: true
    })
  }

  return (
    <div
      className="update-badge-container"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Collapsed Badge */}
      <div className="update-badge">
        <div className="update-badge-content">
          <div className="update-badge-icon-text">
            <WarningCircle size={20} weight="fill" />
            <span className="update-badge-title">
              {t('update.badge.title')}
            </span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDismiss()
            }}
            className="update-badge-close"
          >
            <X size={16} weight="bold" />
          </button>
        </div>
      </div>

      {/* Expanded Tooltip */}
      {showTooltip && (
        <div className="update-tooltip">
          <div className="update-tooltip-inner">
            {/* Header */}
            <div className="update-tooltip-header">
              <WarningCircle size={24} weight="fill" className="update-tooltip-icon" />
              <h3 className="update-tooltip-title">
                {t('update.tooltip.title')}
              </h3>
            </div>

            {/* Version Info */}
            <div className="update-version-info">
              <div className="update-version-row">
                <span className="update-version-label">{t('update.tooltip.currentVersion')}</span>
                <code className="update-version-current">
                  {updateInfo.currentVersion}
                </code>
              </div>
              <div className="update-version-row">
                <span className="update-version-label">{t('update.tooltip.latestVersion')}</span>
                <code className="update-version-latest">
                  {updateInfo.latestVersion}
                </code>
              </div>
            </div>

            {/* Why Update */}
            <div className="update-section">
              <h4 className="update-section-title">
                {t('update.tooltip.whyUpdate')}
              </h4>
              <ul className="update-reasons-list">
                <li className="update-reason-item">
                  <span className="update-reason-check">✓</span>
                  <span>{t('update.tooltip.reason1')}</span>
                </li>
                <li className="update-reason-item">
                  <span className="update-reason-check">✓</span>
                  <span>{t('update.tooltip.reason2')}</span>
                </li>
                <li className="update-reason-item">
                  <span className="update-reason-check">✓</span>
                  <span>{t('update.tooltip.reason3')}</span>
                </li>
              </ul>
            </div>

            {/* Update Steps */}
            <div className="update-section">
              <h4 className="update-section-title">
                {t('update.tooltip.howToUpdate')}
              </h4>
              <ol className="update-steps-list">
                <li className="update-step-item">
                  <span className="update-step-number">1</span>
                  <span>{t('update.tooltip.step1')}</span>
                </li>
                <li className="update-step-item">
                  <span className="update-step-number">2</span>
                  <span>{t('update.tooltip.step2')}</span>
                </li>
                <li className="update-step-item">
                  <span className="update-step-number">3</span>
                  <span>{t('update.tooltip.step3')}</span>
                </li>
              </ol>
            </div>

            {/* Command Box (macOS only) */}
            {platform === 'macOS' && (
              <div className="update-command-box">
                <pre className="update-command-code">
                  {installCommand}
                </pre>
                <button
                  onClick={handleCopy}
                  className="update-copy-btn"
                >
                  {copied ? (
                    <>
                      <Check size={14} weight="bold" />
                      {t('update.tooltip.copied')}
                    </>
                  ) : (
                    <>
                      <Copy size={14} weight="bold" />
                      {t('update.tooltip.copyCommand')}
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Download Button (Windows) */}
            {platform === 'Windows' && updateInfo.downloadUrl && (
              <button
                onClick={handleDownload}
                className="update-download-btn"
              >
                <Download size={18} weight="bold" />
                {t('update.tooltip.downloadScript')}
              </button>
            )}

            {/* Warning */}
            <p className="update-warning">
              ⚠️ {t('update.tooltip.warning')}
            </p>
          </div>
        </div>
      )}

      {/* Inline Styles */}
      <style>{`
        .update-badge-container {
          position: relative;
          margin-bottom: 16px;
          animation: update-slide-in 0.3s ease-out;
        }

        .update-badge {
          border-radius: 16px;
          padding: 12px;
          background: linear-gradient(135deg, #f97316, #e11d48);
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3);
          transition: all 0.2s ease;
        }

        .update-badge:hover {
          box-shadow: 0 6px 20px rgba(249, 115, 22, 0.4);
          transform: translateY(-1px);
        }

        .update-badge-content {
          display: flex;
          align-items: center;
          justify-content: space-between;
          color: white;
        }

        .update-badge-icon-text {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .update-badge-title {
          font-weight: 600;
          font-size: 14px;
        }

        .update-badge-close {
          background: transparent;
          border: none;
          color: white;
          padding: 4px;
          border-radius: 8px;
          cursor: pointer;
          transition: background 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .update-badge-close:hover {
          background: rgba(255, 255, 255, 0.2);
        }

        .update-tooltip {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          margin-top: 8px;
          z-index: 50;
          animation: update-fade-in 0.2s ease-out;
        }

        .update-tooltip-inner {
          background: white;
          border-radius: 16px;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
          border: 1px solid #e2e8f0;
          padding: 20px;
          max-width: 100%;
        }

        .update-tooltip-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 16px;
        }

        .update-tooltip-icon {
          color: #ea580c;
        }

        .update-tooltip-title {
          font-size: 18px;
          font-weight: 700;
          color: #0f172a;
          margin: 0;
        }

        .update-version-info {
          margin-bottom: 16px;
          padding: 12px;
          background: #f8fafc;
          border-radius: 12px;
        }

        .update-version-row {
          display: flex;
          justify-content: space-between;
          font-size: 14px;
          margin-bottom: 4px;
        }

        .update-version-row:last-child {
          margin-bottom: 0;
        }

        .update-version-label {
          color: #64748b;
        }

        .update-version-current {
          font-family: monospace;
          font-weight: 600;
          color: #0f172a;
        }

        .update-version-latest {
          font-family: monospace;
          font-weight: 600;
          color: #059669;
        }

        .update-section {
          margin-bottom: 16px;
        }

        .update-section-title {
          font-size: 14px;
          font-weight: 700;
          color: #0f172a;
          margin: 0 0 8px 0;
        }

        .update-reasons-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .update-reason-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 12px;
          color: #64748b;
        }

        .update-reason-check {
          color: #059669;
          margin-top: 2px;
        }

        .update-steps-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .update-step-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 12px;
          color: #64748b;
        }

        .update-step-number {
          background: #e2e8f0;
          border-radius: 50%;
          padding: 2px 8px;
          font-size: 12px;
          font-weight: 700;
          flex-shrink: 0;
        }

        .update-command-box {
          position: relative;
          margin-bottom: 16px;
        }

        .update-command-code {
          background: #0f172a;
          color: #4ade80;
          padding: 12px;
          border-radius: 12px;
          font-size: 11px;
          overflow-x: auto;
          font-family: monospace;
          white-space: pre-wrap;
          word-break: break-all;
          margin: 0;
        }

        .update-copy-btn {
          position: absolute;
          top: 8px;
          right: 8px;
          padding: 6px 12px;
          background: rgba(255, 255, 255, 0.9);
          border: none;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 700;
          color: #0f172a;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .update-copy-btn:hover {
          background: white;
          transform: scale(1.05);
        }

        .update-download-btn {
          width: 100%;
          margin-bottom: 16px;
          padding: 12px 16px;
          background: linear-gradient(135deg, #f97316, #e11d48);
          color: white;
          border: none;
          border-radius: 12px;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.2s;
        }

        .update-download-btn:hover {
          box-shadow: 0 4px 16px rgba(249, 115, 22, 0.4);
          transform: scale(1.02);
        }

        .update-warning {
          font-size: 12px;
          color: #64748b;
          font-style: italic;
          margin: 0;
        }

        @keyframes update-slide-in {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes update-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  )
}

export default UpdateBadge
