import React, { useRef, useState } from 'react';
import { Modal, Button, Spin, message } from 'antd'; // Tambah message
import { PrinterOutlined, FileImageOutlined } from '@ant-design/icons'; // Tambah Icon
import html2canvas from 'html2canvas'; // Import library

const RawTextPreviewModal = ({ 
    visible, 
    onCancel, 
    content, 
    loading = false, 
    title = "Preview Nota (Dot Matrix Layout)",
    onPrint 
}) => {
    // Ref untuk menangkap elemen kertas
    const paperRef = useRef(null);
    // State loading khusus untuk proses generate gambar
    const [copyLoading, setCopyLoading] = useState(false);

    // --- FUNGSI COPY IMAGE KE CLIPBOARD ---
    const handleCopyToClipboard = async () => {
        if (!paperRef.current) return;

        setCopyLoading(true);
        try {
            // 1. Convert DOM ke Canvas
            const canvas = await html2canvas(paperRef.current, {
                scale: 2, // Meningkatkan resolusi agar teks tajam saat di-paste
                backgroundColor: null, // Transparan di luar border radius (opsional)
                useCORS: true // Mencegah error jika ada gambar eksternal
            });

            // 2. Convert Canvas ke Blob (File Object)
            canvas.toBlob(async (blob) => {
                if (!blob) {
                    message.error("Gagal generate gambar.");
                    setCopyLoading(false);
                    return;
                }

                try {
                    // 3. Tulis ke Clipboard (Fitur Browser Modern)
                    // Item Clipboard harus berupa array of ClipboardItem
                    const data = [new ClipboardItem({ [blob.type]: blob })];
                    await navigator.clipboard.write(data);
                    
                    message.success("Gambar tersalin! Silakan Ctrl+V di WhatsApp.");
                } catch (err) {
                    console.error("Clipboard Error:", err);
                    message.error("Browser tidak mengizinkan akses clipboard otomatis.");
                } finally {
                    setCopyLoading(false);
                }
            }, 'image/png'); // Format PNG

        } catch (error) {
            console.error("Html2Canvas Error:", error);
            message.error("Gagal memproses gambar.");
            setCopyLoading(false);
        }
    };
    
    // --- CSS UTILITIES ---
    const additionalStyles = `
        .custom-scroll-modal .ant-modal-body::-webkit-scrollbar { width: 8px; }
        .custom-scroll-modal .ant-modal-body::-webkit-scrollbar-track { background: #262626; }
        .custom-scroll-modal .ant-modal-body::-webkit-scrollbar-thumb { background: #555; border-radius: 4px; }
        .custom-scroll-modal .ant-modal-body::-webkit-scrollbar-thumb:hover { background: #777; }

        /* Sembunyikan container print di layar biasa */
        .print-source-hidden { display: none; }

        /* Saat Print: Override agar muncul */
        @media print {
            .print-source-hidden { display: flex !important; }
        }
    `;

    // --- LOGIC LUBANG (DOTS) ---
    const renderHoles = () => {
        const holes = Array.from({ length: 11 }); 
        return (
            <div style={{
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between', 
                alignItems: 'center', height: '100%', padding: '10px 0', 
            }}>
                {holes.map((_, i) => (
                    <div key={i} style={{
                        width: '4mm', height: '4mm', borderRadius: '50%',
                        backgroundColor: '#333333', 
                        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)', 
                    }} />
                ))}
            </div>
        );
    };

    return (
        <>
            <style>{additionalStyles}</style>
            
            {/* --- MODAL PREVIEW --- */}
            <Modal
                title={title}
                open={visible}
                onCancel={onCancel}
                width={960}
                style={{ top: 20 }} 
                wrapClassName="custom-scroll-modal"
                bodyStyle={{ 
                    maxHeight: '80vh', overflowY: 'auto', overflowX: 'hidden', 
                    padding: '30px', backgroundColor: '#333333', 
                    display: 'flex', flexDirection: 'column', alignItems: 'center' 
                }} 
                footer={[
                    <Button key="close" onClick={onCancel} disabled={copyLoading}>Tutup</Button>,
                    
                    // --- TOMBOL COPY IMAGE BARU ---
                    <Button 
                        key="copy-img"
                        icon={<FileImageOutlined />}
                        onClick={handleCopyToClipboard}
                        loading={copyLoading}
                        disabled={!content || loading}
                        style={{ borderColor: '#52c41a', color: '#52c41a' }} // Warna hijau (mirip WA)
                    >
                        Salin Gambar (Ctrl+V)
                    </Button>,

                    <Button 
                        key="print" type="primary" icon={<PrinterOutlined />} 
                        onClick={onPrint} disabled={!content || loading || copyLoading}
                    >
                        Print Sekarang
                    </Button>
                ]}
            >
                <Spin spinning={loading} tip="Menyiapkan preview..." style={{ color: '#fff' }}>
                    
                    {/* --- VISUALISASI KERTAS --- 
                        Tambahkan ref={paperRef} di sini agar div INI yang difoto 
                    */}
                    <div ref={paperRef} style={{ 
                        background: '#fff', 
                        width: '9.5in',    
                        minHeight: '5.5in', 
                        display: 'flex', 
                        flexDirection: 'row',
                        boxShadow: '0 15px 40px rgba(0,0,0,0.5)', 
                        position: 'relative',
                        overflow: 'hidden', // Pastikan overflow hidden agar shadow tidak terpotong aneh
                        marginBottom: '15px',
                        flexShrink: 0 
                    }}>
                        
                        {/* STRIP LUBANG KIRI */}
                        <div style={{ 
                            width: '0.5in', height: 'auto', 
                            borderRight: '1px dashed #ccc', backgroundColor: '#f2f2f2' 
                        }}>
                            {renderHoles()}
                        </div>

                        {/* AREA KONTEN TENGAH */}
                        <div style={{ 
                            flex: 1, display: 'flex', justifyContent: 'center', 
                            paddingTop: '0.1in', position: 'relative' 
                        }}>
                            {/* Visualisasi Batas Bawah */}
                            <div style={{
                                position: 'absolute', top: '5.5in', left: 0, right: 0,
                                borderBottom: '2px dashed #ff4d4f', opacity: 0.5,
                                pointerEvents: 'none', zIndex: 10
                            }}>
                                <span style={{ 
                                    position: 'absolute', right: 10, top: -20, 
                                    color: '#ff4d4f', fontSize: 10, fontWeight: 'bold',
                                    background: 'rgba(255,255,255,0.9)', padding: '2px 5px',
                                }}>
                                    Batas Halaman
                                </span>
                            </div>

                            <pre style={{ 
                                fontFamily: '"Courier New", Courier, monospace', 
                                fontSize: '13px', lineHeight: '1.18', margin: 0, 
                                whiteSpace: 'pre', color: '#333'
                            }} dangerouslySetInnerHTML={{ __html: content || "Tidak ada data." }} />
                            
                        </div>

                        {/* STRIP LUBANG KANAN */}
                        <div style={{ 
                            width: '0.5in', height: 'auto', 
                            borderLeft: '1px dashed #ccc', backgroundColor: '#f2f2f2'
                        }}>
                            {renderHoles()}
                        </div>

                    </div>
                    
                    <div style={{ marginTop: 5, fontSize: 12, color: '#bfbfbf', fontStyle: 'italic', textAlign: 'center', opacity: 0.8 }}>
                        * Garis merah horizontal adalah batas fisik kertas Half-Letter (5.5 Inch).
                    </div>

                </Spin>
            </Modal>

            {/* --- AREA KHUSUS PRINT --- */}
            <div className="print-container print-source-hidden">
                <pre className="struk-content" dangerouslySetInnerHTML={{ __html: content || "" }} />
            </div>
        </>
    );
};

export default RawTextPreviewModal;