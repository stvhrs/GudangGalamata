import React, { useRef, useState } from 'react';
import { Modal, Button, Spin, message } from 'antd';
import { PrinterOutlined, FileImageOutlined } from '@ant-design/icons';
import html2canvas from 'html2canvas';

const RawTextPreviewModal = ({ 
    visible, 
    onCancel, 
    content, 
    loading = false, 
    title = "Preview Nota (Dot Matrix Layout)",
    onPrint 
}) => {
    const paperRef = useRef(null);
    const [copyLoading, setCopyLoading] = useState(false);

    // ============================================================
    //  LOGIC PEWARNAAN TEKS (PER BARIS)
    // ============================================================
// ============================================================
    //  LOGIC PEWARNAAN TEKS (PER BARIS)
    // ============================================================
    const formatContentWithColor = (text) => {
        if (!text) return "Tidak ada data.";
        
        const lines = text.split('\n');
        const styleGreen = 'color: #3f8600; font-weight: bold;'; 
        const styleRed = 'color: #cf1322; font-weight: bold;';   

        const processedLines = lines.map(line => {
            // A. Cek Status (Prioritas)
            if (line.includes("BELUM LUNAS")) return `<span style="${styleRed}">${line}</span>`;
            if (line.includes("LUNAS") && !line.includes("BELUM")) return `<span style="${styleGreen}">${line}</span>`;

            // --- [BARU] PENGECUALIAN ---
            // Jika baris mengandung "Tagihan :" DAN "Bayar :" secara bersamaan, 
            // biarkan tetap hitam (jangan dihijaukan).
            if (line.includes("Tagihan :") && line.includes("Bayar :")) {
                return line; 
            }

            // B. Cek Totalan
            const totalKeywords = [
                "TOTAL PEMBAYARAN:",
                "TOTAL UANG KEMBALI :",
                "TOTAL UANG KEMBALI :",
                "TOTAL BAYAR:",
                "TOTAL TAGIHAN",
                "Sisa    :" // Keyword ini yang tadinya memicu warna hijau
            ];
            
            const isTotalLine = totalKeywords.some(keyword => line.includes(keyword));
            if (isTotalLine) return `<span style="${styleGreen}">${line}</span>`;

            return line;
        });

        return processedLines.join('\n');
    };
    // --- FUNGSI COPY IMAGE KE CLIPBOARD ---
    const handleCopyToClipboard = async () => {
        if (!paperRef.current) return;

        setCopyLoading(true);
        try {
            const canvas = await html2canvas(paperRef.current, {
                scale: 2, 
                backgroundColor: null, 
                useCORS: true 
            });

            canvas.toBlob(async (blob) => {
                if (!blob) {
                    message.error("Gagal generate gambar.");
                    setCopyLoading(false);
                    return;
                }
                try {
                    const data = [new ClipboardItem({ [blob.type]: blob })];
                    await navigator.clipboard.write(data);
                    message.success("Gambar tersalin! Silakan Ctrl+V di WhatsApp.");
                } catch (err) {
                    console.error("Clipboard Error:", err);
                    message.error("Browser tidak mengizinkan akses clipboard otomatis.");
                } finally {
                    setCopyLoading(false);
                }
            }, 'image/png');
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
        .print-source-hidden { display: none; }
        @media print { .print-source-hidden { display: flex !important; } }
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
                    <Button key="copy-img" icon={<FileImageOutlined />} onClick={handleCopyToClipboard} loading={copyLoading} disabled={!content || loading} style={{ borderColor: '#52c41a', color: '#52c41a' }}>
                        Salin Gambar (Ctrl+V)
                    </Button>,
                    <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={onPrint} disabled={!content || loading || copyLoading}>
                        Print Sekarang
                    </Button>
                ]}
            >
                <Spin spinning={loading} tip="Menyiapkan preview..." style={{ color: '#fff' }}>
                    
                    {/* --- VISUALISASI KERTAS --- */}
                    <div ref={paperRef} style={{ 
                        background: '#fff', 
                        width: '9.5in',    
                        minHeight: '5.5in', 
                        display: 'flex', 
                        flexDirection: 'row',
                        boxShadow: '0 15px 40px rgba(0,0,0,0.5)', 
                        position: 'relative',
                        overflow: 'hidden', 
                        marginBottom: '15px',
                        flexShrink: 0 
                    }}>
                        
                        {/* STRIP LUBANG KIRI */}
                        <div style={{ width: '0.5in', height: 'auto', borderRight: '1px dashed #ccc', backgroundColor: '#f2f2f2' }}>
                            {renderHoles()}
                        </div>

                        {/* AREA KONTEN TENGAH */}
                        <div style={{ 
                            flex: 1, 
                            display: 'flex', 
                            justifyContent: 'center', 
                            paddingTop: '0.1in', 
                            position: 'relative',
                            // PENTING: Padding kiri kanan 0 agar muat 96 char
                            paddingLeft: 0,
                            paddingRight: 0
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

                            {/* --- CONTENT PREVIEW --- */}
                            <pre style={{ 
                                // Font Native Windows 7
                                fontFamily: '"Courier New", Courier, monospace', 
                                fontSize: '13px', 
                                lineHeight: '1.18', 
                                margin: 0, 
                                whiteSpace: 'pre', 
                                color: '#333',
                                letterSpacing: '-0.5px', // Condensed Mode
                                // fontWeight: '600'  <-- INI DIHAPUS (Biar gak bold semua)
                            }} 
                            dangerouslySetInnerHTML={{ __html: formatContentWithColor(content) }} 
                            />
                            
                        </div>

                        {/* STRIP LUBANG KANAN */}
                        <div style={{ width: '0.5in', height: 'auto', borderLeft: '1px dashed #ccc', backgroundColor: '#f2f2f2' }}>
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
                <pre className="struk-content" dangerouslySetInnerHTML={{ __html: formatContentWithColor(content) }} />
            </div>
        </>
    );
};

export default RawTextPreviewModal;