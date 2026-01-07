# -*- mode: python ; coding: utf-8 -*-

block_cipher = None

# Hidden imports matching build-macos-zip.sh
hidden_imports = [
    'ctranslate2.converters.eole_ct2',
    'faster_whisper.assets',
    'opencc.__main__',
    'tokenizers.tools',
    'yt_dlp.compat._legacy',
    'yt_dlp.compat._deprecated',
    'yt_dlp.utils._legacy',
    'yt_dlp.utils._deprecated',
    'Cryptodome',
    'mutagen',
    'brotli',
    'certifi',
    'secretstorage',
    'curl_cffi',
]

# 1. Analysis for Main Service (The heavy lifter)
a_service = Analysis(
    ['../mini_transcriber.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz_service = PYZ(a_service.pure, a_service.zipped_data, cipher=block_cipher)
exe_service = EXE(
    pyz_service,
    a_service.scripts,
    [],
    exclude_binaries=True,
    name='video-text-transcriber',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False, # Hide console window
)

# 2. Analysis for Host Wrapper (The Native Messaging handler)
a_host = Analysis(
    ['host_win.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz_host = PYZ(a_host.pure, a_host.zipped_data, cipher=block_cipher)
exe_host = EXE(
    pyz_host,
    a_host.scripts,
    [],
    exclude_binaries=True,
    name='native-host',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False, # Must be False for Native Messaging to work via Stdio
)

# 3. Collect (Combine both into one folder)
# PyInstaller will automatically deduplicate shared libraries found in both analyses
coll = COLLECT(
    exe_service,
    a_service.binaries,
    a_service.zipfiles,
    a_service.datas,
    
    exe_host,
    a_host.binaries,
    a_host.zipfiles,
    a_host.datas,
    
    strip=False,
    upx=True,
    upx_exclude=[],
    name='video-text-transcriber',
)
