import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
  TemplateRef,
  ViewChild,
  ViewContainerRef
} from "@angular/core";
import { AlertComponent } from "../alert/alert.component";
import { faPenToSquare } from "@fortawesome/free-regular-svg-icons";
import { faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import { BsModalRef, BsModalService } from "ngx-bootstrap/modal";
import { DomSanitizer } from "@angular/platform-browser";
import { ViewportScroller } from "@angular/common";
import { DeviceDetectorService } from "ngx-device-detector";
import { AiService } from "../http/ai.service";
import Quill from "quill";

@Component({
  selector: "scholarsome-card",
  templateUrl: "./card.component.html",
  styleUrls: ["./card.component.scss"]
})
export class CardComponent implements OnInit, AfterViewInit {
  constructor(
    private readonly bsModalService: BsModalService,
    private readonly vps: ViewportScroller,
    private readonly deviceService: DeviceDetectorService,
    private readonly aiService: AiService,
    public readonly sanitizer: DomSanitizer
  ) {}

  protected changingTerm: string;
  protected changingDefinition: string;

  @Input() editingEnabled = false;

  @Input() cardId: string;
  @Input() cardIndex: number;

  @Input() originalIndex: number;
  @Input() isSaved: boolean;

  @Input() upArrow = true;
  @Input() downArrow = true;
  @Input() trashCan = true;

  @Output() addCardEvent = new EventEmitter();
  @Output() deleteCardEvent = new EventEmitter<number>();
  @Output() moveCardEvent = new EventEmitter<{ index: number, direction: number }>();
  @Output() indexChangeEvent = new EventEmitter<{ newIndex: number }>();
  @Output() editCardEvent = new EventEmitter();

  @ViewChild("card", { static: false }) cardElement: Element;
  @ViewChild("termDiv", { static: false }) termElement: ElementRef;
  @ViewChild("definitionDiv", { static: false }) definitionElement: ElementRef;
  @ViewChild("inputsContainer", { static: false, read: ViewContainerRef }) inputsContainer: ViewContainerRef;

  @ViewChild("editModal") modal: TemplateRef<HTMLElement>;

  // these two vars exist so that we can prevent the main card
  // from updating while a card is being edited
  protected actualTerm: string;
  protected actualDefinition: string;

  protected emptyCardAlert = false;

  protected isMobile = false;
  protected aiAvailable = false;
  protected aiContent = "";
  protected aiLoading = false;
  protected aiError = "";

  protected modalRef?: BsModalRef;
  protected readonly faPenToSquare = faPenToSquare;
  protected readonly faWandMagicSparkles = faWandMagicSparkles;

  ngOnInit() {
    this.actualTerm = this.changingTerm ? this.changingTerm : "";
    this.actualDefinition = this.changingDefinition ? this.changingDefinition : "";

    this.isMobile = this.deviceService.isMobile();

    if (this.editingEnabled) {
      this.aiService.isAvailable().then((available) => {
        this.aiAvailable = available;
      });
    }
  }

  ngAfterViewInit() {
    /*
    these two subscriptions here are to prevent the main card from updating
    while the card is being edited

    otherwise it's distracting to see changes in the background while typing
     */
    this.bsModalService.onShow.subscribe(() => {
      this.actualTerm = String(this.actualTerm) as string;
      this.actualDefinition = String(this.actualDefinition) as string;
    });

    this.bsModalService.onHide.subscribe(() => {
      this.actualTerm = this.changingTerm ? this.changingTerm : "";
      this.actualDefinition = this.changingDefinition ? this.changingDefinition : "";
    });

    // scroll to bottom of cards list
    if (this.editingEnabled) {
      this.vps.scrollToPosition([0, document.body.scrollHeight]);
    }

    // open the edit modal when new cards are added
    if (
      this.editingEnabled &&
      !this.changingTerm &&
      !this.changingDefinition &&
      (this.upArrow || this.downArrow)
    ) {
      this.openEditModal();
    }
  }

  @Input()
  get term(): string {
    return this.actualTerm;
  }
  set term(value: string) {
    this.changingTerm = value;
    this.actualTerm = value;
  }

  @Input()
  get definition(): string {
    return this.actualDefinition;
  }
  set definition(value: string) {
    this.changingDefinition = value;
    this.actualDefinition = value;
  }

  openEditModal() {
    this.modalRef = this.bsModalService.show(this.modal, { class: "modal-xl" });
  }

  deleteCard() {
    this.deleteCardEvent.emit(this.cardIndex);
  }

  notifyEmptyInput() {
    if (!this.emptyCardAlert) {
      const alert = this.inputsContainer.createComponent<AlertComponent>(AlertComponent);

      alert.instance.message = "Both fields cannot be empty";
      alert.instance.type = "danger";
      alert.instance.dismiss = true;
      alert.instance.spacingClass = "mt-4";

      this.emptyCardAlert = true;
      setTimeout(() => this.emptyCardAlert = false, 3000);
    }
  }

  moveCard(direction: number) {
    this.moveCardEvent.emit({ index: this.cardIndex, direction });
  }

  async generateWithAi() {
    if (!this.aiContent || this.aiContent.trim().length < 10) {
      this.aiError = "Please enter at least 10 characters of content.";
      return;
    }

    this.aiLoading = true;
    this.aiError = "";

    const result = await this.aiService.generateCard(this.aiContent.trim());

    this.aiLoading = false;

    if (!result) {
      this.aiError = "Failed to generate card. Please try again or fill in the card manually.";
      return;
    }

    if (result.error) {
      this.aiError = result.error;
      return;
    }

    this.changingTerm = result.term;
    this.changingDefinition = result.definition;
    this.editCardEvent.emit();
    this.aiContent = "";
  }

  // Set cursor position to end
  focusEditor($event: Quill) {
    $event.setSelection($event.getLength(), 0);
  }
}
