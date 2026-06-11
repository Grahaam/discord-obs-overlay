import { useEffect, useState } from 'react';

export default function UpdateNotification() {
    const [update, setUpdate] = useState<{latest: string, current: string, downloadUrl: string} | null>(null);

    useEffect(() => {
        fetch('/api/check-update')
            .then(res => res.json())
            .then(data => { if (data.updateAvailable) setUpdate(data); });
    }, []);

    if (!update) return null;

    return (
        <div style={{
            position: 'fixed', bottom: '20px', right: '20px', 
            background: '#333', color: '#fff', padding: '15px', 
            borderRadius: '8px', zIndex: 1000, boxShadow: '0 2px 10px rgba(0,0,0,0.5)'
        }}>
            <p>✨ New version <strong>v{update.latest}</strong> available (Current: v{update.current})</p>
            <a href={update.downloadUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#00d1b2' }}>
                Download Now
            </a>
            <button onClick={() => setUpdate(null)} style={{ marginLeft: '10px' }}>Dismiss</button>
        </div>
    );
}
