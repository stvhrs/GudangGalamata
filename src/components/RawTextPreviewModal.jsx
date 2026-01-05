import React from 'react';
import { Modal, Button, Spin } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';

const RawTextPreviewModal = ({ 
    visible, 
    onCancel, 
    content, 
    loading = false, 
    title = "Preview Nota (Dot Matrix Layout)",
    onPrint 
}) => {
    
    // CSS Custom Scrollbar
    const customScrollbarStyle = `
        .custom-scroll-modal .ant-modal-body::-webkit-scrollbar { width: 8px; }
        .custom-scroll-modal .ant-modal-body::-webkit-scrollbar-track { background: #262626; }
        .custom-scroll-modal .ant-modal-body::-webkit-scrollbar-thumb { background: #555; border-radius: 4px; }
        .custom-scroll-modal .ant-modal-body::-webkit-scrollbar-thumb:hover { background: #777; }
    `;

    // --- LOGIC LUBANG (DOTS) ---
    const renderHoles = () => {
        const holes = Array.from({ length: 11 }); 
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between', 
                alignItems: 'center',
                height: '100%',
                padding: '10px 0', 
            }}>
                {holes.map((_, i) => (
                    <div key={i} style={{
                        width: '4mm',
                        height: '4mm',
                        borderRadius: '50%',
                        backgroundColor: '#333333', 
                        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)', 
                    }} />
                ))}
            </div>
        );
    };

    return (
        <>
            <style>{customScrollbarStyle}</style>
            <Modal
                title={title}
                open={visible}
                onCancel={onCancel}
                width={960}
                style={{ top: 20 }} 
                wrapClassName="custom-scroll-modal"
                bodyStyle={{ 
                    maxHeight: '80vh', 
                    overflowY: 'auto',   
                    overflowX: 'hidden', 
                    padding: '30px', 
                    backgroundColor: '#333333', 
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center' 
                }} 
                footer={[
                    <Button key="close" onClick={onCancel}>Tutup</Button>,
                    <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={onPrint} disabled={!content || loading}>Print Sekarang</Button>
                ]}
            >
                <Spin spinning={loading} tip="Menyiapkan preview..." style={{ color: '#fff' }}>
                    
                    {/* --- KERTAS DOKUMEN --- */}
                    <div style={{ 
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
                        
                        {/* --- STRIP LUBANG KIRI --- */}
                        <div style={{ 
                            width: '0.5in', 
                            height: 'auto', 
                            borderRight: '1px dashed #ccc', 
                            backgroundColor: '#f2f2f2' 
                        }}>
                            {renderHoles()}
                        </div>

                        {/* --- AREA KONTEN TENGAH --- */}
                        <div style={{ 
                            flex: 1, 
                            display: 'flex',
                            justifyContent: 'center', 
                            paddingTop: '0.1in',
                            position: 'relative' 
                        }}>
                            {/* Visualisasi Batas Bawah */}
                            <div style={{
                                position: 'absolute',
                                top: '5.5in', 
                                left: 0, right: 0,
                                borderBottom: '2px dashed #ff4d4f', 
                                opacity: 0.5,
                                pointerEvents: 'none',
                                zIndex: 10
                            }}>
                                <span style={{ 
                                    position: 'absolute', right: 10, top: -20, 
                                    color: '#ff4d4f', fontSize: 10, fontWeight: 'bold',
                                    background: 'rgba(255,255,255,0.9)', padding: '2px 5px',
                                }}>
                                    Batas Halaman
                                </span>
                            </div>

                            {/* --- PERBAIKAN DI SINI --- */}
                            <pre 
                                style={{ 
                                    fontFamily: '"Courier New", Courier, monospace', 
                                    fontSize: '13px', 
                                    lineHeight: '1.18', 
                                    margin: 0, 
                                    whiteSpace: 'pre', 
                                    color: '#333'
                                }}
                                // Menggunakan property ini agar tag <b> dirender sebagai HTML
                                dangerouslySetInnerHTML={{ __html: content || "Tidak ada data." }}
                            />
                            
                        </div>

                        {/* --- STRIP LUBANG KANAN --- */}
                        <div style={{ 
                            width: '0.5in', 
                            height: 'auto', 
                            borderLeft: '1px dashed #ccc', 
                            backgroundColor: '#f2f2f2'
                        }}>
                            {renderHoles()}
                        </div>

                    </div>
                    
                    <div style={{ marginTop: 5, fontSize: 12, color: '#bfbfbf', fontStyle: 'italic', textAlign: 'center', opacity: 0.8 }}>
                        * Garis merah horizontal adalah batas fisik kertas Half-Letter (5.5 Inch).
                    </div>

                </Spin>
            </Modal>
        </>
    );
};

export default RawTextPreviewModal;