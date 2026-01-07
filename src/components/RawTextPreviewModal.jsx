// src/components/RawTextPreviewModal.js

import React, { useRef, useState } from 'react';
import { Modal, Button, message } from 'antd';
import { PrinterOutlined, FileImageOutlined } from '@ant-design/icons';
import html2canvas from 'html2canvas';

const RawTextPreviewModal = ({ 
    visible, 
    onCancel, 
    content, // Sekarang content ini berisi String HTML
    loading = false, 
    title = "Preview Nota",
    onPrint 
}) => {
    const paperRef = useRef(null);
    const [copyLoading, setCopyLoading] = useState(false);

    // --- COPY IMAGE ---
    const handleCopyToClipboard = async () => {
        if (!paperRef.current) return;
        setCopyLoading(true);
        try {
            const canvas = await html2canvas(paperRef.current, { scale: 2, useCORS: true });
            canvas.toBlob(async (blob) => {
                if (!blob) { message.error("Gagal."); setCopyLoading(false); return; }
                try {
                    await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
                    message.success("Gambar disalin!");
                } catch (e) { message.error("Gagal akses clipboard."); }
                setCopyLoading(false);
            });
        } catch (e) { console.error(e); setCopyLoading(false); }
    };

    return (
        <Modal
            title={title}
            open={visible}
            onCancel={onCancel}
            width={1000}
            style={{ top: 20 }}
            footer={[
                <Button key="close" onClick={onCancel}>Tutup</Button>,
                <Button key="copy" icon={<FileImageOutlined />} onClick={handleCopyToClipboard} loading={copyLoading}>Salin Gambar</Button>,
                <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={onPrint} disabled={!content}>Print</Button>
            ]}
        >
            <div style={{ background: '#555', padding: '20px', display: 'flex', justifyContent: 'center', overflow: 'auto' }}>
                
                {/* --- VISUAL KERTAS --- */}
                <div 
                    ref={paperRef}
                    style={{
                        width: '210mm', // Setara A4 Width / Continuous Form Landscape
                        minHeight: '140mm', // Setara setengah kuarto
                        padding: '10mm',
                        backgroundColor: 'white',
                        boxShadow: '0 0 10px rgba(0,0,0,0.5)',
                        fontFamily: "'Consolas', Courier, monospace",
                        color: 'black'
                    }}
                >
                    {/* INJECT HTML DISINI */}
                    {content ? (
                        <div 
                            dangerouslySetInnerHTML={{ __html: content }} 
                            style={{ width: '100%' }} // Pastikan width fill
                        />
                    ) : (
                        <p>No Data</p>
                    )}
                </div>

            </div>
        </Modal>
    );
};

export default RawTextPreviewModal;