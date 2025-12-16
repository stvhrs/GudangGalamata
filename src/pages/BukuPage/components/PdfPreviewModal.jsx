import React from 'react';
import { Modal, Button } from 'antd';
import { DownloadOutlined, CloseOutlined } from '@ant-design/icons';

export default function PdfPreviewModal({ visible, onClose, pdfBlobUrl, fileName }) {
    
    // Fungsi untuk download manual jika tombol download di viewer tidak muncul
    const handleDownload = () => {
        const link = document.createElement('a');
        link.href = pdfBlobUrl;
        link.download = fileName || 'dokumen.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <Modal
            title={`Preview: ${fileName || 'Dokumen'}`}
            open={visible} // AntD v5 pakai 'open', v4 pakai 'visible'
            onCancel={onClose}
            width={1000}
            centered
            footer={[
                <Button key="close" icon={<CloseOutlined />} onClick={onClose}>
                    Tutup
                </Button>,
                <Button 
                    key="download" 
                    type="primary" 
                    icon={<DownloadOutlined />} 
                    onClick={handleDownload}
                >
                    Download PDF
                </Button>,
            ]}
            bodyStyle={{ padding: 0, height: '80vh' }}
            style={{ top: 20 }}
        >
            {pdfBlobUrl ? (
                <iframe
                    src={pdfBlobUrl}
                    title="PDF Preview"
                    width="100%"
                    height="100%"
                    style={{ border: 'none', height: '100%', minHeight: '500px' }}
                />
            ) : (
                <div style={{ padding: 20, textAlign: 'center' }}>
                    Memuat PDF...
                </div>
            )}
        </Modal>
    );
}