import { useState, useEffect, useRef } from "react";

// ── PKCE helpers ─────────────────────────────────────────────────────────────
function generateVerifier() {
  const arr = new Uint8Array(64);
  window.crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
async function generateChallenge(v) {
  const d = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(v));
  return btoa(String.fromCharCode(...new Uint8Array(d))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

const CLIENT_ID = '50d30fa8e01649ff845b2fb989b014ab';
const REDIRECT_URI = 'http://127.0.0.1:8888/callback';
const SCOPES = 'playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private user-read-private user-read-email';

const SORT_OPTIONS = [
  { id: 'artist', label: 'Sanatçı', icon: '🎤' },
  { id: 'track', label: 'Şarkı Adı', icon: '🎵' },
  { id: 'album', label: 'Albüm', icon: '💿' },
  { id: 'release', label: 'Çıkış Tarihi', icon: '📅' },
  { id: 'popularity', label: 'Popülerlik', icon: '🔥' },
  { id: 'duration', label: 'Süre', icon: '⏱️' },
  { id: 'genre', label: 'Tür', icon: '🎸' },
  { id: 'added', label: 'Eklenme Tarihi', icon: '📌' },
];

// ── Spotify API wrapper ───────────────────────────────────────────────────────
async function spotifyFetch(url, token, opts = {}) {
  const { headers: extraHeaders, ...restOpts } = opts;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, ...extraHeaders },
    ...restOpts
  });
  if (!r.ok) {
    let msg = `API error ${r.status}`;
    try {
      const errData = await r.json();
      if (errData.error && errData.error.message) {
        msg += ` - ${errData.error.message}`;
      }
    } catch(e) {}
    throw new Error(msg);
  }
  if (r.status === 204) return null;
  return r.json();
}

async function fetchAllPages(firstUrl, token) {
  let items = [], url = firstUrl;
  while (url) {
    const d = await spotifyFetch(url, token);
    items = [...items, ...d.items];
    url = d.next;
  }
  return items;
}

// ── Components ────────────────────────────────────────────────────────────────
function Spinner({ size = 20 }) {
  return <span className="spin" style={{ fontSize: size }}>⟳</span>;
}

function Avatar({ src, size = 36, fallback = '?' }) {
  return src
    ? <img src={src} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
    : <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, color: 'var(--muted)' }}>{fallback}</div>;
}

// ── Setup Screen ──────────────────────────────────────────────────────────────
function SetupScreen() {
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setLoading(true);
    const v = generateVerifier();
    const c = await generateChallenge(v);
    sessionStorage.setItem('sp_verifier', v);
    
    const p = new URLSearchParams({ 
      client_id: CLIENT_ID, 
      response_type: 'code', 
      redirect_uri: REDIRECT_URI, 
      scope: SCOPES, 
      code_challenge_method: 'S256', 
      code_challenge: c 
    });
    
    // Electron'da varsayılan tarayıcıda aç
    if (window.api && window.api.openExternal) {
      window.api.openExternal(`https://accounts.spotify.com/authorize?${p}`);
    } else {
      window.location.href = `https://accounts.spotify.com/authorize?${p}`;
    }
  }

  return (
    <div className="fade-in" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <div style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🎵</div>
        <h1 className="syne" style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1, marginBottom: 8 }}>
          Playlist <span style={{ color: 'var(--green)' }}>Organizer</span>
        </h1>
        <p style={{ color: 'var(--muted2)', fontSize: 15, marginBottom: 40 }}>Spotify playlistlerini istediğin gibi sırala</p>

        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 32 }}>
          <button className="btn-green" style={{ width: '100%', padding: '14px', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }} onClick={handleLogin} disabled={loading}>
            {loading ? <Spinner size={16} /> : null}
            {loading ? 'Tarayıcıda onay bekleniyor...' : 'Spotify ile Giriş Yap →'}
          </button>
          <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 16 }}>Tarayıcı açıldığında Spotify hesabınızla giriş yapıp izin verin.</p>
        </div>
      </div>
    </div>
  );
}

// ── Playlists Screen ──────────────────────────────────────────────────────────
function PlaylistsScreen({ token, user, playlists, loading, onSelect, onLogout }) {
  const [search, setSearch] = useState('');
  const filtered = playlists.filter(p => p && p.name && p.name.toLowerCase().includes(search.toLowerCase()));

  // Debug: ilk playlistin yapısını konsola yaz
  useEffect(() => {
    if (playlists.length > 0) {
      console.log('İlk playlist verisi:', JSON.stringify(playlists[0], null, 2));
    }
  }, [playlists]);

  return (
    <div className="fade-in" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16, position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ fontSize: 20, fontWeight: 800, fontFamily: 'Syne', letterSpacing: -0.5, flex: 1 }}>
          🎵 <span style={{ color: 'var(--green)' }}>Playlist</span> Organizer
        </div>
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar src={user.images?.[0]?.url} size={32} fallback={user.display_name?.[0]} />
            <span style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>{user.display_name}</span>
            <button className="btn-ghost" style={{ padding: '6px 12px', fontSize: 12 }} onClick={onLogout}>Çıkış</button>
          </div>
        )}
      </div>

      <div style={{ maxWidth: 1000, margin: '0 auto', width: '100%', padding: '32px 24px' }}>
        <h2 className="syne" style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Playlistlerin</h2>
        <p style={{ color: 'var(--muted2)', fontSize: 14, marginBottom: 24 }}>Düzenlemek istediğin playlisti seç</p>

        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍  Playlist ara..." style={{ marginBottom: 24, maxWidth: 400, fontSize: 15, padding: '12px 16px' }} />

        {loading ? (
          <div style={{ textAlign: 'center', padding: 80, color: 'var(--muted)' }}>
            <Spinner size={32} /><br />
            <span style={{ fontSize: 14, marginTop: 16, display: 'block' }}>Yükleniyor...</span>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
            {filtered.map(pl => (
              <button key={pl.id} onClick={() => onSelect(pl)} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12, padding: 0, overflow: 'hidden', cursor: 'pointer', transition: 'all .2s', textAlign: 'left' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.transform = 'translateY(-4px)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; }}>
                <div style={{ width: '100%', aspectRatio: '1', background: 'var(--border2)', overflow: 'hidden', position: 'relative' }}>
                  {pl.images?.[0] ? (
                    <img src={pl.images[0].url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>🎵</div>
                  )}
                </div>
                <div style={{ padding: '14px 16px' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pl.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{pl.tracks?.total ?? pl.items?.total ?? 0} şarkı</div>
                </div>
              </button>
            ))}
            {filtered.length === 0 && <div style={{ color: 'var(--muted)', fontSize: 14, gridColumn: '1/-1', padding: 20 }}>Sonuç bulunamadı.</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tracks Screen ─────────────────────────────────────────────────────────────
function TracksScreen({ token, playlist, onBack }) {
  const [tracks, setTracks] = useState([]);
  const [sortedTracks, setSortedTracks] = useState([]);
  const [sortBy, setSortBy] = useState('artist');
  const [sortDir, setSortDir] = useState('asc');
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('Şarkılar yükleniyor...');
  const [applying, setApplying] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Önce /items dene, 403 gelirse /tracks dene
        let items;
        try {
          console.log('Şarkılar yükleniyor: /items endpoint...');
          items = await fetchAllPages(`https://api.spotify.com/v1/playlists/${playlist.id}/items?limit=100`, token);
        } catch (e1) {
          console.warn('/items başarısız:', e1.message, '→ /tracks deneniyor...');
          items = await fetchAllPages(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks?limit=100`, token);
        }
        console.log('Toplam item:', items.length, 'İlk item:', items[0]);
        // Spotify /items endpoint'i 'track' yerine 'item' döndürebilir — normalize et
        const normalized = items.map(i => ({
          ...i,
          track: i.track || i.item
        }));
        const valid = normalized.filter(i => i.track && !i.track.is_local);
        console.log('Geçerli şarkı sayısı:', valid.length);
        setStatus(`${valid.length} şarkı yüklendi. Tür bilgileri alınıyor...`);

        // Tür bilgilerini çekmeyi dene — başarısız olursa şarkıları yine de göster
        const genreMap = {};
        try {
          const artistIds = [...new Set(valid.flatMap(i => i.track.artists.map(a => a.id)).filter(Boolean))];
          for (let i = 0; i < artistIds.length; i += 50) {
            const d = await spotifyFetch(`https://api.spotify.com/v1/artists?ids=${artistIds.slice(i, i + 50).join(',')}`, token);
            d.artists.forEach(a => { if (a) genreMap[a.id] = a.genres; });
          }
        } catch (genreErr) {
          console.warn('Tür bilgileri alınamadı (sorun değil, devam ediliyor):', genreErr.message);
        }

        const enriched = valid.map(item => ({
          ...item,
          genres: item.track.artists.flatMap(a => genreMap[a.id] || [])
        }));
        setTracks(enriched);
        setStatus('');
      } catch (e) {
        console.error('Şarkı yükleme hatası:', e);
        setStatus('Hata: ' + e.message);
      }
      setLoading(false);
    })();
  }, [playlist.id, token]);

  useEffect(() => {
    if (!tracks.length) return;
    const sorted = [...tracks].sort((a, b) => {
      let va, vb;
      switch (sortBy) {
        case 'track': va = a.track.name; vb = b.track.name; break;
        case 'artist': va = a.track.artists[0]?.name || ''; vb = b.track.artists[0]?.name || ''; break;
        case 'album': va = a.track.album.name; vb = b.track.album.name; break;
        case 'duration': va = a.track.duration_ms; vb = b.track.duration_ms; break;
        case 'release': va = a.track.album.release_date; vb = b.track.album.release_date; break;
        case 'popularity': va = a.track.popularity; vb = b.track.popularity; break;
        case 'genre': va = a.genres[0] || 'zzz'; vb = b.genres[0] || 'zzz'; break;
        case 'added': va = a.added_at; vb = b.added_at; break;
        default: return 0;
      }
      if (typeof va === 'number') return sortDir === 'asc' ? va - vb : vb - va;
      const cmp = (va||'').localeCompare(vb||'', 'tr');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    setSortedTracks(sorted);
  }, [sortBy, sortDir, tracks]);

  async function applyChanges() {
    setApplying(true);
    setSuccess(false);
    try {
      const uris = sortedTracks.map(i => i.track?.uri).filter(Boolean);
      await spotifyFetch(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, token, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uris: uris.slice(0, 100) })
      });
      for (let i = 100; i < uris.length; i += 100) {
        await spotifyFetch(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, token, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uris: uris.slice(i, i + 100) })
        });
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (e) {
      alert('Hata: ' + e.message);
    }
    setApplying(false);
  }

  function fmt(ms) {
    const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  const activeSortOpt = SORT_OPTIONS.find(o => o.id === sortBy);

  return (
    <div className="fade-in" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--border)', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16, position: 'sticky', top: 0, zIndex: 10 }}>
        <button className="btn-ghost" style={{ padding: '8px 14px', fontSize: 13 }} onClick={onBack}>← Geri</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1 }}>
          {playlist.images?.[0] && <img src={playlist.images[0].url} alt="" style={{ width: 40, height: 40, borderRadius: 6, objectFit: 'cover' }} />}
          <div>
            <div className="syne" style={{ fontSize: 16, fontWeight: 700 }}>{playlist.name}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{tracks.length} şarkı</div>
          </div>
        </div>
        {success && <div style={{ background: '#0a2e18', border: '1px solid var(--green)', color: 'var(--green)', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600 }}>✓ Spotify'a Kaydedildi!</div>}
        <button className="btn-green" onClick={applyChanges} disabled={applying || loading || !tracks.length} style={{ minWidth: 160 }}>
          {applying ? <><Spinner size={14} /> Uygulanıyor...</> : '✓ Spotify\'a Uygula'}
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, maxWidth: 1200, margin: '0 auto', width: '100%', padding: '24px', gap: 24, alignItems: 'flex-start' }}>
        
        {/* Left: Sort panel */}
        <div style={{ width: 240, flexShrink: 0, position: 'sticky', top: 96 }}>
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20 }}>
            <h3 className="syne" style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--muted2)', letterSpacing: .5, textTransform: 'uppercase' }}>Sıralama Ölçütü</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 24 }}>
              {SORT_OPTIONS.map(opt => (
                <button key={opt.id} onClick={() => setSortBy(opt.id)} style={{
                  background: sortBy === opt.id ? 'var(--border2)' : 'transparent',
                  border: sortBy === opt.id ? `1px solid var(--green)` : '1px solid transparent',
                  borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12,
                  color: sortBy === opt.id ? 'var(--text)' : 'var(--muted2)',
                  fontSize: 14, fontWeight: sortBy === opt.id ? 600 : 400, textAlign: 'left',
                  cursor: 'pointer', transition: 'all .15s', width: '100%'
                }}>
                  <span style={{ fontSize: 16 }}>{opt.icon}</span> {opt.label}
                  {sortBy === opt.id && <span style={{ marginLeft: 'auto', color: 'var(--green)', fontSize: 10 }}>●</span>}
                </button>
              ))}
            </div>
            <h3 className="syne" style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--muted2)', letterSpacing: .5, textTransform: 'uppercase' }}>Sıralama Yönü</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['asc', '↑ A→Z'], ['desc', '↓ Z→A']].map(([d, l]) => (
                <button key={d} onClick={() => setSortDir(d)} style={{
                  flex: 1, padding: '10px 8px', borderRadius: 8, border: `1px solid ${sortDir === d ? 'var(--green)' : 'var(--border2)'}`,
                  background: sortDir === d ? '#0a2e18' : 'transparent', color: sortDir === d ? 'var(--green)' : 'var(--muted2)',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all .15s'
                }}>{l}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Track list */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 80, color: 'var(--muted)', background: 'var(--card)', borderRadius: 16, border: '1px solid var(--border)' }}>
              <Spinner size={36} /><br />
              <span style={{ fontSize: 14, marginTop: 16, display: 'block', color: 'var(--muted2)' }}>{status}</span>
            </div>
          ) : (
            <div style={{ background: 'var(--card)', border: `1px solid var(--border)`, borderRadius: 16, overflow: 'hidden' }}>
              <div className="track-row" style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: .6, padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)' }}>
                <span style={{ textAlign: 'center' }}>#</span>
                <span>Şarkı / Sanatçı</span>
                <span className="track-col-album">Albüm</span>
                <span className="track-col-pop">Popülerlik</span>
                <span style={{ textAlign: 'right' }}>Süre</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', padding: '8px' }}>
                {sortedTracks.map((item, i) => {
                  const t = item.track;
                  const pop = t.popularity;
                  const genre = item.genres[0];
                  return (
                    <div key={`${t.id}-${i}`} className="track-row" style={{ fontSize: 14 }}>
                      <span style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center' }}>{i + 1}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        <img src={t.album.images?.[2]?.url || t.album.images?.[0]?.url} alt="" style={{ width: 40, height: 40, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text)' }}>{t.name}</div>
                          <div style={{ color: 'var(--muted2)', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
                            {t.artists.map(a => a.name).join(', ')}
                            {genre && <span style={{ marginLeft: 8, color: 'var(--muted)', fontSize: 10, background: 'var(--border)', padding: '2px 6px', borderRadius: 4, textTransform: 'capitalize' }}>{genre}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="track-col-album" style={{ color: 'var(--muted2)', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.album.name}</div>
                      <div className="track-col-pop">
                        <div style={{ height: 6, background: 'var(--border2)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pop}%`, background: `linear-gradient(90deg, var(--greenDim), var(--green))`, borderRadius: 3 }} />
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, fontWeight: 500 }}>{pop}/100</div>
                      </div>
                      <span style={{ textAlign: 'right', color: 'var(--muted2)', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{fmt(t.duration_ms)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [loadingPL, setLoadingPL] = useState(false);
  const [selectedPL, setSelectedPL] = useState(null);
  const [screen, setScreen] = useState('setup');

  const authProcessed = useRef(false);

  const handleAuthCode = async (code) => {
    if (authProcessed.current) return; // tek seferlik çalıştır
    authProcessed.current = true;
    const verifier = sessionStorage.getItem('sp_verifier');
    if (code && verifier) {
      try {
        const r = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: CLIENT_ID, grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: verifier })
        });
        const d = await r.json();
        if (d.access_token) {
          sessionStorage.setItem('sp_token', d.access_token);
          setToken(d.access_token);
          setScreen('playlists');
        } else {
          console.error('Token alınamadı:', d);
          authProcessed.current = false; // tekrar denenebilsin
        }
      } catch (e) {
        console.error('Auth error', e);
        authProcessed.current = false;
      }
    }
  };

  useEffect(() => {
    // Dinle: Electron main process'ten gelen callback kodu (tarayıcıdan döndüğünde)
    if (window.api && window.api.onOAuthCallback) {
      window.api.onOAuthCallback((code) => {
        handleAuthCode(code);
      });
    }

    const saved = sessionStorage.getItem('sp_token');
    if (saved) { setToken(saved); setScreen('playlists'); }
  }, []);

  useEffect(() => {
    if (!token || screen !== 'playlists') return;
    (async () => {
      setLoadingPL(true);
      try {
        const [u, items] = await Promise.all([
          spotifyFetch('https://api.spotify.com/v1/me', token),
          fetchAllPages('https://api.spotify.com/v1/me/playlists?limit=50', token)
        ]);
        setUser(u);
        setPlaylists(items.filter(p => p && p.name && p.id));
      } catch (e) { 
        console.error(e);
        if (e.message.includes('401')) logout(); // Token expired
      }
      setLoadingPL(false);
    })();
  }, [token, screen]);

  function logout() {
    sessionStorage.removeItem('sp_token');
    setToken(null); setUser(null); setPlaylists([]); setSelectedPL(null);
    setScreen('setup');
  }

  return (
    <>
      {screen === 'setup' && <SetupScreen />}
      {screen === 'playlists' && (
        <PlaylistsScreen
          token={token} user={user} playlists={playlists} loading={loadingPL}
          onSelect={pl => { setSelectedPL(pl); setScreen('tracks'); }}
          onLogout={logout}
        />
      )}
      {screen === 'tracks' && selectedPL && (
        <TracksScreen
          token={token} playlist={selectedPL}
          onBack={() => { setSelectedPL(null); setScreen('playlists'); }}
        />
      )}
    </>
  );
}
