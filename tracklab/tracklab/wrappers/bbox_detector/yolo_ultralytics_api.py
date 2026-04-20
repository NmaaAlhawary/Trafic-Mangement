import logging
from typing import Any

import torch
import pandas as pd

from ultralytics import YOLO

from tracklab.pipeline.imagelevel_module import ImageLevelModule
from tracklab.utils.coordinates import ltrb_to_ltwh

log = logging.getLogger(__name__)


def collate_fn(batch):
    idxs = [b[0] for b in batch]
    images = [b["image"] for _, b in batch]
    shapes = [b["shape"] for _, b in batch]
    return idxs, (images, shapes)


class YOLOUltralytics(ImageLevelModule):
    collate_fn = collate_fn
    input_columns = []
    output_columns = [
        "image_id",
        "video_id",
        "category_id",
        "bbox_ltwh",
        "bbox_conf",
    ]

    def __init__(self, cfg, device, batch_size, **kwargs):
        super().__init__(batch_size)
        self.cfg = cfg
        self.device = device
        self.model = YOLO(cfg.path_to_checkpoint)
        self.model.to(device)
        self.id = 0
        self.allowed_classes = set(getattr(cfg, "allowed_classes", [0]))
        self.category_id_map = getattr(cfg, "category_id_map", {})

    @torch.no_grad()
    def preprocess(self, image, detections, metadata: pd.Series):
        return {
            "image": image,
            "shape": (image.shape[1], image.shape[0]),
        }

    @torch.no_grad()
    def process(self, batch: Any, detections: pd.DataFrame, metadatas: pd.DataFrame):
        images, shapes = batch
        results_by_image = self.model(images, verbose=False)
        detections = []
        for results, shape, (_, metadata) in zip(
            results_by_image, shapes, metadatas.iterrows()
        ):
            for bbox in results.boxes.cpu().numpy():
                cls_id = int(bbox.cls[0]) if hasattr(bbox.cls, "__len__") else int(bbox.cls)
                conf = float(bbox.conf[0]) if hasattr(bbox.conf, "__len__") else float(bbox.conf)
                if cls_id in self.allowed_classes and conf >= self.cfg.min_confidence:
                    detections.append(
                        pd.Series(
                            dict(
                                image_id=metadata.name,
                                bbox_ltwh=ltrb_to_ltwh(bbox.xyxy[0], shape),
                                bbox_conf=conf,
                                video_id=metadata.video_id,
                                category_id=self.category_id_map.get(cls_id, cls_id),
                            ),
                            name=self.id,
                        )
                    )
                    self.id += 1
        return detections
