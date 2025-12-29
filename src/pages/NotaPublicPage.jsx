// src/pages/NotaPublicPage.jsx
// Versi: react-pdf viewer + Firebase (Header + Items) + blob generator

import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ref, get, query, orderByChild, equalTo } from 'firebase/database'; // Tambah query imports
import { db } from '../api/firebase';
import { generateNotaPDF } from '../utils/pdfGenerator';
import { Layout, Spin, Button, App, Result, Space, Typography } from 'antd';
import { DownloadOutlined, ShareAltOutlined } from '@ant-design/icons';
import { Worker, Viewer } from '@react-pdf-viewer/core';
import '@react-pdf-viewer/core/lib/styles/index.css';

const { Header, Content } = Layout;
const { Title } = Typography;

const NotaPublicPage = () => {
    const { id } = useParams();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [pdfBlob, setPdfBlob] = useState(null);
    const [transaksi, setTransaksi] = useState(null);
    const { message } = App.useApp();

    useEffect(() => {
        if (!id) {
            setError("ID Transaksi tidak ditemukan.");
            setLoading(false);
            return;
        }

        const fetchAndGenerate = async () => {
            setLoading(true);
            setError(null);
            try {
                // 1. Ambil Data Header Invoice
                const txRef = ref(db, `invoices/${id}`);
                const txSnapshot = await get(txRef);
                
                if (txSnapshot.exists()) {
                    const txHeader = { id: txSnapshot.key, ...txSnapshot.val() };
                    
                    // Cek Status Pembayaran (Nota hanya untuk yang sudah bayar/DP)
                    // Sesuaikan string status dengan database Anda (case sensitive)
                    const allowedStatus = ['DP', 'Sebagian', 'LUNAS', 'SEBAGIAN']; 
                    if (!allowedStatus.includes(txHeader?.statusPembayaran)) {
                        setError("Nota tidak dapat dibuat untuk transaksi yang belum dibayar.");
                        setLoading(false);
                        return;
                    }

                    // 2. Ambil Data Items (invoice_items) berdasarkan invoiceId
                    const itemsRef = query(
                        ref(db, 'invoice_items'),
                        orderByChild('invoiceId'),
                        equalTo(id)
                    );
                    const itemsSnapshot = await get(itemsRef);
                    
                    const itemsArray = [];
                    if (itemsSnapshot.exists()) {
                        itemsSnapshot.forEach((child) => {
                            itemsArray.push({ id: child.key, ...child.val() });
                        });
                    }

                    // 3. Gabungkan
                    const fullData = {
                        ...txHeader,
                        items: itemsArray
                    };
                    
                    setTransaksi(fullData);

                    // 4. Generate PDF
                    const dataUri = generateNotaPDF(fullData); // Asumsi generateNotaPDF synchronous, jika async tambah await
                    const blob = await fetch(dataUri).then((r) => r.blob());
                    setPdfBlob(blob);

                } else {
                    setError("Transaksi tidak ditemukan.");
                }
            } catch (err) {
                console.error('Nota load error:', err);
                setError(err.message || 'Gagal memuat data');
            } finally {
                setLoading(false);
            }
        };

        fetchAndGenerate();
    }, [id]);

    const getPdfTitle = () => {
        if (!transaksi) return 'nota.pdf';
        return `Nota_${transaksi.id}.pdf`;
    };

    const handleDownloadPdf = async () => {
        if (!pdfBlob) return;
        message.loading({ content: 'Mempersiapkan download...', key: 'pdfdownload' });
        try {
            const url = URL.createObjectURL(pdfBlob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', getPdfTitle());
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            message.success({ content: 'Download dimulai!', key: 'pdfdownload', duration: 2 });
        } catch (error) {
            console.error('Download error:', error);
            message.error({ content: `Gagal download: ${error.message}`, key: 'pdfdownload', duration: 3 });
        }
    };

    const handleSharePdf = async () => {
        if (!navigator.share) {
            message.error('Web Share API tidak didukung di browser ini.');
            return;
        }
        try {
            const file = new File([pdfBlob], getPdfTitle(), { type: 'application/pdf' });
            const shareData = {
                title: `Nota ${transaksi?.id || id}`,
                text: `Berikut adalah nota untuk ${transaksi?.namaCustomer || 'pelanggan'}`,
                files: [file],
            };

            if (navigator.canShare && navigator.canShare(shareData)) {
                await navigator.share(shareData);
                message.success('File berhasil dibagikan!');
            } else {
                await navigator.share({
                    title: `Nota ${transaksi?.id || id}`,
                    url: window.location.href,
                });
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Share error:', error);
                message.error(`Gagal membagikan: ${error.message}`);
            }
        }
    };

    return (
        <Layout style={{ minHeight: '100vh', backgroundColor: '#f0f2f5' }}>
            <Header style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: 'white',
                borderBottom: '1px solid #f0f0f0',
                padding: '0 24px',
                position: 'fixed',
                width: '100%',
                zIndex: 10
            }}>
                <Title level={4} style={{ margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {loading ? 'Memuat Nota...' : `Nota: ${transaksi?.id || id}`}
                </Title>
                <Space>
                    <Button
                        icon={<ShareAltOutlined />}
                        onClick={handleSharePdf}
                        disabled={loading || !!error || !pdfBlob}
                    >
                        Share
                    </Button>
                    <Button
                        type="primary"
                        icon={<DownloadOutlined />}
                        onClick={handleDownloadPdf}
                        disabled={loading || !!error || !pdfBlob}
                    >
                        Download
                    </Button>
                </Space>
            </Header>
            <Content style={{
                paddingTop: '64px',
                height: '100vh',
                display: 'flex',
                flexDirection: 'column'
            }}>
                {loading && (
                    <div style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Spin size="large" tip="Mempersiapkan nota..." />
                    </div>
                )}
                {error && (
                    <div style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Result
                            status="error"
                            title="Gagal Memuat Nota"
                            subTitle={error}
                        />
                    </div>
                )}
                
                {!loading && !error && pdfBlob && (
                    <div
                        style={{
                            flexGrow: 1,
                            overflow: 'auto',
                            backgroundColor: '#f0f2f5',
                        }}
                    >
                        <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
                            <Viewer fileUrl={URL.createObjectURL(pdfBlob)} />
                        </Worker>
                    </div>
                )}

            </Content>
        </Layout>
    );
};

export default NotaPublicPage;