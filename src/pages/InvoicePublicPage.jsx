import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
// Pastikan semua fungsi query diimport
import { ref, get, query, orderByChild, equalTo } from 'firebase/database';
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
                console.log("Start fetching Nota ID:", id);

                // 1. AMBIL HEADER INVOICE
                const txRef = ref(db, `invoices/${id}`);
                const txSnapshot = await get(txRef);
                
                if (!txSnapshot.exists()) {
                    throw new Error("Transaksi tidak ditemukan.");
                }

                const txHeader = { id: txSnapshot.key, ...txSnapshot.val() };
                console.log("Header Nota Found:", txHeader);
                
                // Cek Status Pembayaran (Nota biasanya untuk yang sudah bayar)
                // Sesuaikan logika status ini dengan kebutuhan Anda
                const allowedStatus = ['DP', 'Sebagian', 'LUNAS', 'SEBAGIAN']; 
                if (!allowedStatus.includes(txHeader?.statusPembayaran)) {
                    throw new Error("Nota belum tersedia (Status: Belum Lunas/DP).");
                }

                // 2. AMBIL ITEMS (Query Relation berdasarkan invoiceId)
                const itemsQuery = query(
                    ref(db, 'invoice_items'),
                    orderByChild('invoiceId'),
                    equalTo(id)
                );
                
                const itemsSnapshot = await get(itemsQuery);
                const itemsArray = [];

                if (itemsSnapshot.exists()) {
                    itemsSnapshot.forEach((child) => {
                        itemsArray.push({ id: child.key, ...child.val() });
                    });
                }
                console.log("Items Nota Found:", itemsArray);

                // 3. GABUNGKAN
                const fullData = {
                    ...txHeader,
                    items: itemsArray
                };
                
                setTransaksi(fullData);

                // 4. GENERATE PDF
                const dataUri = generateNotaPDF(fullData); 
                // Jika generateNotaPDF itu async, pakai await: await generateNotaPDF(fullData)
                
                const blob = await fetch(dataUri).then((r) => r.blob());
                setPdfBlob(blob);

            } catch (err) {
                console.error('Nota load error:', err);
                setError(err.message || 'Gagal memuat data');
            } finally {
                setLoading(false);
            }
        };

        fetchAndGenerate();
    }, [id]);

    // --- UTILS ---
    const getPdfTitle = () => transaksi ? `Nota_${transaksi.id}.pdf` : 'nota.pdf';

    const handleDownloadPdf = async () => {
        if (!pdfBlob) return;
        message.loading({ content: 'Downloading...', key: 'pdfdownload' });
        try {
            const url = URL.createObjectURL(pdfBlob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', getPdfTitle());
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            message.success({ content: 'Selesai!', key: 'pdfdownload' });
        } catch (error) {
            message.error({ content: 'Gagal download', key: 'pdfdownload' });
        }
    };

    const handleSharePdf = async () => {
        if (!navigator.share || !pdfBlob) return message.error('Fitur share tidak didukung.');
        try {
            const file = new File([pdfBlob], getPdfTitle(), { type: 'application/pdf' });
            await navigator.share({
                title: `Nota ${transaksi?.id}`,
                text: `Nota ${transaksi?.namaCustomer}`,
                files: [file],
            });
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <Layout style={{ minHeight: '100vh', backgroundColor: '#f0f2f5' }}>
            <Header style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                backgroundColor: 'white', borderBottom: '1px solid #f0f0f0',
                padding: '0 24px', position: 'fixed', width: '100%', zIndex: 10
            }}>
                <Title level={4} style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {loading ? 'Memuat...' : `Nota: ${transaksi?.id || id}`}
                </Title>
                <Space>
                    <Button icon={<ShareAltOutlined />} onClick={handleSharePdf} disabled={loading || !!error || !pdfBlob}>Share</Button>
                    <Button type="primary" icon={<DownloadOutlined />} onClick={handleDownloadPdf} disabled={loading || !!error || !pdfBlob}>Download</Button>
                </Space>
            </Header>

            <Content style={{ paddingTop: '64px', height: '100vh', display: 'flex', flexDirection: 'column' }}>
                {loading && <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}><Spin size="large" tip="Loading Nota..." /></div>}
                {error && <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}><Result status="error" title="Gagal" subTitle={error} /></div>}
                {!loading && !error && pdfBlob && (
                    <div style={{ flex: 1, overflow: 'auto', backgroundColor: '#f0f2f5' }}>
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